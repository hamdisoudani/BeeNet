import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response as ExpressResponse } from 'express';
import { Readable } from 'node:stream';
import * as crypto from 'node:crypto';
import { AppLogger } from '../common/logger.service';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { Types } from 'mongoose';
import { ProxyService } from './proxy.service';
import { SecretsService } from '../secrets/secrets.service';

@Controller()
export class ProxyController {
  constructor(
    private logger: AppLogger,
    private svc: ProxyService,
    private secrets: SecretsService,
  ) {
    this.logger.setContext('ProxyController');
  }

  @UseGuards(ClerkAuthGuard)
  @All('copilotkit*')
  async proxy(@Req() req: Request, @Res() res: ExpressResponse) {
    const base = process.env.AGENT_URL || 'http://localhost:8000/copilotkit';
    const original = (req.originalUrl || req.url) as string;
    const suffixWithQuery = original.replace(/^\/(?:api\/)?copilotkit/, '');
    const url = new URL(base);
    if (suffixWithQuery) {
      const qIndex = suffixWithQuery.indexOf('?');
      const suffixPath = qIndex >= 0 ? suffixWithQuery.slice(0, qIndex) : suffixWithQuery;
      const suffixQuery = qIndex >= 0 ? suffixWithQuery.slice(qIndex) : '';
      url.pathname = (url.pathname.replace(/\/$/, '') || '') + (suffixPath || '');
      url.search = suffixQuery || '';
    }

    // Defer incoming request logging until after we parse body so we can include a safe preview

    // Forward headers as-is and inject per-user model API overrides
    const headers: Record<string, string> = {};
    Object.keys(req.headers).forEach(key => {
      const value = req.headers[key];
      if (typeof value === 'string') {
        headers[key] = value;
      } else if (Array.isArray(value)) {
        headers[key] = value.join(', ');
      }
    });

    const init: any = { method: req.method, headers };
    // Capture userId for persistence
    const authUserId: string | undefined = (req as any)?.auth?.userId;
    let bodySize = 0;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const parsed = (req as any).body;
      if (typeof parsed !== 'undefined') {
        try {
          const buf = Buffer.isBuffer(parsed)
            ? parsed
            : typeof parsed === 'string'
              ? Buffer.from(parsed)
              : Buffer.from(JSON.stringify(parsed));
          init.body = buf;
          bodySize = buf.length;
          headers['content-type'] = headers['content-type'] || 'application/json';
        } catch (e) {
          this.logger.warn({ event: 'parsed_body_encode_failed', error: String(e) });
        }
      } else if (!req.readableEnded && !req.complete) {
        const chunks: Buffer[] = [];
        try {
          this.logger.debug({ event: 'reading_request_body', method: req.method });
          await new Promise<void>((resolve, reject) => {
            req.on('data', (c: Buffer) => {
              chunks.push(c);
              this.logger.debug({ event: 'body_chunk_received', size: c.length });
            });
            req.on('end', () => {
              this.logger.debug({ event: 'body_read_complete', totalChunks: chunks.length });
              resolve();
            });
            req.on('error', reject);
          });
        } catch (e) {
          try { this.logger.error(`failed_to_read_request_body: ${String(e)}`); } catch {}
        }
        if (chunks.length > 0) {
          init.body = Buffer.concat(chunks);
          bodySize = init.body.length;
        }
      } else {
        this.logger.debug({ event: 'no_body_to_forward' });
      }
      (init as any).duplex = 'half' as any;
    }

    // If user secrets exist, add override headers for the Python agent to consume
    try {
      if (authUserId) {
        const s = await this.svc.getUserSecrets(authUserId);
        try {
          const tav = await this.secrets.resolveTavilyKeyForUser(authUserId);
          if (tav) headers['x-tavily-api-key'] = String(tav);
        } catch {}

        // Determine which model to use: explicit x-model-id header or user's default
        const requestedModelId = (req.headers['x-model-id'] as string) || undefined;
        try {
          const resolved = await this.secrets.resolveModelForUser(authUserId, requestedModelId);
          if (resolved) {
            if ((resolved as any).baseUrl) headers['x-openai-base-url'] = String((resolved as any).baseUrl);
            if ((resolved as any).model) headers['x-openai-model'] = String((resolved as any).model);
            if ((resolved as any).apiKey) headers['x-openai-api-key'] = String((resolved as any).apiKey);
            if ((resolved as any).provider) headers['x-model-provider'] = String((resolved as any).provider);
          }
        } catch {}
      }
    } catch {}

    // Do not add x-thread-id; CopilotKit handles thread scoping internally

    // Compute server-to-server HMAC signature for agent auth (if configured)
    try {
      const shared = process.env.PROXY_SHARED_SECRET;
      if (shared && typeof shared === 'string' && shared.trim().length > 0) {
        const sentAt = Math.floor(Date.now() / 1000).toString();
        const nonce = crypto.randomUUID();
        const bodyHash = crypto
          .createHash('sha256')
          .update(init.body ? Buffer.from(init.body) : Buffer.alloc(0))
          .digest('hex');
        const msg = `${req.method}|${url.pathname}|${sentAt}|${nonce}|${bodyHash}`;
        const signature = crypto.createHmac('sha256', shared).update(msg).digest('hex');
        headers['x-sent-at'] = sentAt;
        headers['x-nonce'] = nonce;
        headers['x-proxy-signature'] = signature;
      }
    } catch {}

    // Log incoming request (sanitized headers and body preview only)
    try {
      const bodyPreview = init.body ? String(init.body).slice(0, 500) : 'no body';
      let operationName: string | undefined;
      try { const bj = init.body ? JSON.parse(String(init.body)) : undefined; operationName = typeof bj?.operationName === 'string' ? bj.operationName : undefined; } catch {}
      const h = req.headers || {} as any;
      const safeHeaders = {
        'content-type': (h['content-type'] as string) || (h['Content-Type'] as string) || undefined,
        'content-length': (h['content-length'] as string) || (h['Content-Length'] as string) || undefined,
        'user-agent': (h['user-agent'] as string) || undefined,
        hasAuthorization: Boolean(h['authorization']),
        hasCookie: Boolean(h['cookie']),
        hasClerkToken: Boolean(h['x-clerk-auth-token']),
      } as any;
      this.logger.debug({
        event: 'incoming_request',
        method: req.method,
        path: url.pathname + (url.search || ''),
        originalUrl: original,
        operationName,
        bodyPreview,
        headers: safeHeaders,
      });
    } catch {}

    // Intercept CopilotKit GraphQL loadAgentState to prevent UI hydration from agent memory
    try {
      const ct = (headers['content-type'] || headers['Content-Type'] || '') as string;
      const isJson = typeof ct === 'string' && ct.includes('application/json');
      if (isJson && init.body) {
        let gqlBody: any = undefined;
        try { gqlBody = JSON.parse(String(init.body)); } catch {}
        const opName: string | undefined = typeof gqlBody?.operationName === 'string' ? gqlBody.operationName : undefined;
        const queryStr: string | undefined = typeof gqlBody?.query === 'string' ? gqlBody.query : undefined;
        const isLoadAgentState = opName === 'loadAgentState' || (queryStr ? /\bloadAgentState\b/.test(queryStr) : false);
        if (isLoadAgentState) {
          const reqThreadId = (() => {
            try { return String(gqlBody?.variables?.data?.threadId || '').trim(); } catch { return ''; }
          })();
          const payload = {
            data: {
              loadAgentState: {
                threadId: reqThreadId || undefined,
                threadExists: false,
                state: '{}',
                messages: '[]',
                __typename: 'LoadAgentStateResponse',
              },
            },
          };
          try { this.logger.debug({ event: 'intercept_load_agent_state', threadId: reqThreadId }); } catch {}
          res.status(200);
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(payload));
          return;
        }
      }
    } catch {}

    // Log what we're sending to agent (sanitized headers) and model debug
    try {
      const bodyPreview = init.body ? String(init.body).slice(0, 500) : 'no body';
      const fh = headers || {} as any;
      const safeForwardHeaders = {
        'content-type': fh['content-type'] || fh['Content-Type'],
        'content-length': fh['content-length'] || fh['Content-Length'],
        hasAuthorization: Boolean(fh['authorization']),
        hasCookie: Boolean(fh['cookie']),
        hasClerkToken: Boolean(fh['x-clerk-auth-token']),
        modelHost: (() => { try { const u = fh['x-openai-base-url'] ? new URL(fh['x-openai-base-url']) : undefined; return u?.hostname; } catch { return undefined; } })(),
        modelName: fh['x-openai-model'],
        hasModelKey: Boolean(fh['x-openai-api-key']),
        hasTavilyKey: Boolean(fh['x-tavily-api-key']),
        hasProxySig: Boolean(fh['x-proxy-signature']),
      } as any;
      this.logger.log({ 
        event: 'calling_agent', 
        url: url.toString(), 
        method: req.method, 
        bodySize, 
        bodyPreview,
        headers: safeForwardHeaders,
      });
    } catch {}

    const started = Date.now();
    let upstream: any;
    try {
      upstream = await fetch(url.toString(), init as any);
    } catch (e) {
      this.logger.error({ event: 'agent_call_failed', url: url.toString(), error: String(e) });
      res.status(502).end('Agent unreachable');
      return;
    }

    // Stream agent response for SSE endpoints; buffer only for /info
    const pathname = url.pathname || '';
    const isStreaming = /\/copilotkit\/(agents\/execute|agents\/state)$/.test(pathname);
    if (isStreaming && upstream.body) {
      // If this is an execute call, attempt to persist turn messages
      const isExecute = /\/copilotkit\/agents\/execute$/.test(pathname);
      let persistContext: {
        userId?: string;
        threadId?: string;
        conversationId?: Types.ObjectId;
        turnId?: string;
        agentState?: any;
        stateSnapshot?: any;
        agentName?: string;
        assistantText?: string;
        sseBuffer?: string;
        assistantIsFinal?: boolean;
        seenLCStream?: boolean;
        assistantId?: string;
      } = { userId: authUserId, assistantText: '', sseBuffer: '' } as any;
      try {
        if (isExecute && authUserId) {
          // Parse original request body to extract threadId and user message
          let bodyJson: any = undefined;
          try {
            if (init.body) bodyJson = JSON.parse(String(init.body));
          } catch {}
          const threadId = String(bodyJson?.threadId || bodyJson?.thread_id || '').trim();
          const messages = Array.isArray(bodyJson?.messages) ? bodyJson.messages : [];
          const lastUser = [...messages].reverse().find((m: any) => (m?.role || m?.sender) === 'user');
          if (threadId && lastUser?.content) {
            persistContext.threadId = threadId;
            // Upsert conversation via service
            const convId = await this.svc.findOrCreateConversation(authUserId, threadId);
            persistContext.conversationId = convId as Types.ObjectId;
            // Persist user message with a new turnId
            const turnId = typeof lastUser?.id === 'string' && lastUser.id.trim().length > 0
              ? String(lastUser.id)
              : require('crypto').randomUUID();
            persistContext.turnId = turnId;
            await this.svc.persistUserMessage({
              userId: authUserId,
              conversationId: convId,
              threadId,
              turnId,
              content: String(lastUser.content),
              messageId: typeof lastUser?.id === 'string' ? lastUser.id : undefined,
            });
          }
        }
      } catch (e) {
        this.logger.warn({ event: 'persist_user_message_failed', error: String(e) });
      }
      try {
        // Set headers suitable for streaming
        res.status(upstream.status);
        upstream.headers.forEach((v: string, k: string) => {
          // Avoid fixed content-length for streams
          if (k.toLowerCase() === 'content-length') return;
          res.setHeader(k, v);
        });
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        if (!res.getHeader('Content-Type')) {
          res.setHeader('Content-Type', 'text/event-stream');
        }
        // Pipe without buffering
        const nodeStream = Readable.fromWeb(upstream.body as any);
        nodeStream.on('error', () => res.end());
        res.flushHeaders?.();

        // Tee: forward to client while parsing for final state/assistant
        nodeStream.on('data', (chunk: Buffer) => {
          try {
            res.write(chunk);
            // Parse SSE/NDJSON lines with chunk buffering
            const str = chunk.toString('utf8');
            persistContext.sseBuffer = (persistContext.sseBuffer || '') + str;
            const parts = (persistContext.sseBuffer || '').split('\n');
            persistContext.sseBuffer = parts.pop() || '';
            for (const raw of parts) {
              const line = raw.trim();
              console.log("line", line);
              if (!line) continue;
              let payload: string | undefined;
              if (line.startsWith('data:')) {
                payload = line.slice(5).trim();
              } else if (line.startsWith('{') || line.startsWith('[')) {
                payload = line;
              } else {
                continue;
              }
              if (!payload) continue;
              try {
                const evt = JSON.parse(payload);
                // Role/content envelope (CopilotKit)
                const role = evt?.message?.role || evt?.role;
                const content = evt?.message?.content ?? evt?.content;
                const delta = evt?.message?.delta ?? evt?.delta ?? evt?.textDelta ?? evt?.choices?.[0]?.delta?.content;
                const agentName = evt?.agentName || evt?.message?.agentName || evt?.state?.agentName || evt?.agent_name;
                if (agentName && !persistContext.agentName) persistContext.agentName = String(agentName);
                if (evt && typeof evt === 'object' && (evt as any).state) {
                  persistContext.stateSnapshot = (evt as any).state;
                  // Do not append assistant text from state during streaming to avoid duplicates
                }
                if (role === 'agent_state' && !evt?.event) {
                  persistContext.agentState = content ?? (evt as any)?.state ?? evt;
                }
                if (role === 'assistant' && !evt?.event && !persistContext.assistantIsFinal && !persistContext.seenLCStream) {
                  const chunkText = typeof content === 'string' && content ? content : (typeof delta === 'string' ? delta : '');
                  if (chunkText) {
                    persistContext.assistantText = (persistContext.assistantText || '') + chunkText;
                  }
                }
                // Event-based envelopes (LangChain/LangGraph)
                const evtName: string | undefined = (evt?.event as string) || undefined;
                if (evtName === 'on_copilotkit_state_sync') {
                  const st = (evt as any).state;
                  if (st) {
                    persistContext.stateSnapshot = st;
                    if (!persistContext.agentName && typeof (evt as any).agent_name === 'string') {
                      persistContext.agentName = (evt as any).agent_name;
                    }
                    try {
                      const msgs = Array.isArray(st?.messages) ? st.messages : [];
                      const lastAssistant = [...msgs].reverse().find((m: any) => (m?.role || m?.sender) === 'assistant');
                      const lastId = lastAssistant?.id || lastAssistant?.messageId;
                      if (typeof lastId === 'string') persistContext.assistantId = lastId;
                    } catch {}
                    // Do not derive assistant text here; we only fallback to state at the end
                  }
                } else if (evtName === 'on_chat_model_stream') {
                  try {
                    const token = (evt as any)?.data?.chunk?.kwargs?.content;
                    persistContext.seenLCStream = true;
                    if (typeof token === 'string' && token && !persistContext.assistantIsFinal) {
                      persistContext.assistantText = (persistContext.assistantText || '') + token;
                    }
                  } catch {}
                } else if (evtName === 'on_chat_model_end') {
                  try {
                    const full = (evt as any)?.data?.output?.kwargs?.content;
                    const outId = (evt as any)?.data?.output?.kwargs?.id;
                    if (typeof full === 'string' && full) {
                      // Prefer the final full content over accumulated partials
                      persistContext.assistantText = full;
                      persistContext.assistantIsFinal = true;
                    }
                    if (typeof outId === 'string') {
                      persistContext.assistantId = outId;
                    }
                  } catch {}
                } else if (evtName === 'on_chain_end') {
                  try {
                    const out = (evt as any)?.data?.output;
                    const kw = out?.kwargs;
                    const c1 = typeof kw?.content === 'string' ? kw.content : undefined;
                    if (c1 && !persistContext.assistantIsFinal) {
                      persistContext.assistantText = (persistContext.assistantText || '') + c1;
                    }
                  } catch {}
                }
              } catch {}
            }
          } catch {}
        });

        nodeStream.on('end', async () => {
          try {
            res.end();
          } finally {
            // After stream completes, persist agent_state and assistant
            try {
              // Helpful debug log of what we captured during the stream
              try {
                const messagesLen = Array.isArray((persistContext.stateSnapshot as any)?.messages)
                  ? (persistContext.stateSnapshot as any).messages.length
                  : undefined;
                let lastAssistantFromState: string | undefined;
                try {
                  const msgs = Array.isArray((persistContext.stateSnapshot as any)?.messages)
                    ? (persistContext.stateSnapshot as any).messages
                    : [];
                  const lastAssistant = [...msgs].reverse().find((m: any) => (m?.role || m?.sender) === 'assistant');
                  const lastContent = lastAssistant?.content ?? lastAssistant?.text;
                  if (typeof lastContent === 'string') lastAssistantFromState = lastContent;
                } catch {}
                this.logger.debug({
                  event: 'stream_end_received',
                  path: pathname,
                  userId: persistContext.userId,
                  threadId: persistContext.threadId,
                  conversationId: persistContext.conversationId?.toString?.(),
                  turnId: persistContext.turnId,
                  agentName: persistContext.agentName,
                  hasAgentState: Boolean(persistContext.agentState),
                  hasStateSnapshot: Boolean(persistContext.stateSnapshot),
                  stateMessagesLen: messagesLen,
                  assistantTextLen: (persistContext.assistantText || '').length,
                  assistantPreview: String(persistContext.assistantText || '').slice(0, 160),
                  lastAssistantFromStatePreview: (lastAssistantFromState || '').slice(0, 160),
                });
              } catch {}
              if (persistContext.userId && persistContext.conversationId && persistContext.turnId) {
                let createdCount = 0;
                if (persistContext.agentState || persistContext.stateSnapshot) {
                  const rawState = persistContext.agentState ?? persistContext.stateSnapshot;
                  // Save only the plan object inside state (exclude messages/copilotkit)
                  let planOnly: any = undefined;
                  try {
                    const p = rawState?.plan;
                    if (p && typeof p === 'object') {
                      planOnly = { plan: { mode: p.mode, steps: p.steps, reason: p.reason } };
                    }
                  } catch {}
                  await this.svc.persistAssistantState({
                    userId: persistContext.userId!,
                    conversationId: persistContext.conversationId!,
                    threadId: persistContext.threadId!,
                    turnId: persistContext.turnId!,
                    agentName: persistContext.agentName,
                    rawState: rawState,
                  });
                  createdCount += 1;
                }
                // Ensure assistant text is non-empty; if empty, try to derive from state snapshot
                let finalAssistantText = (persistContext.assistantText || '').trim();
                if (!finalAssistantText && persistContext.stateSnapshot) {
                  try {
                    const msgs = Array.isArray(persistContext.stateSnapshot?.messages) ? persistContext.stateSnapshot.messages : [];
                    const lastAssistant = [...msgs].reverse().find((m: any) => (m?.role || m?.sender) === 'assistant');
                    const lastContent = lastAssistant?.content ?? lastAssistant?.text;
                    if (typeof lastContent === 'string') finalAssistantText = lastContent.trim();
                  } catch {}
                }
                if (finalAssistantText) {
                  await this.svc.persistAssistantText({
                    userId: persistContext.userId!,
                    conversationId: persistContext.conversationId!,
                    threadId: persistContext.threadId!,
                    turnId: persistContext.turnId!,
                    agentName: persistContext.agentName,
                    content: finalAssistantText,
                    messageId: persistContext.assistantId,
                  });
                  createdCount += 1;
                }
                await this.svc.updateConversationOnCreate(persistContext.conversationId!, createdCount);
              }
            } catch (e) {
              this.logger.warn({ event: 'persist_stream_tail_failed', error: String(e) });
            }
          }
        });

        // Start piping after attaching listeners
        nodeStream.resume();
        //this.logger.log({ event: 'agent_stream_started', status: upstream.status, path: pathname });
      } catch (e) {
        this.logger.error({ event: 'stream_pipe_failed', error: String(e) });
        res.status(500).end('Stream failed');
      }
      return;
    }

    // Non-streaming endpoints (e.g., /info)
    try {
      const responseText = await upstream.text();
      //this.logger.log({ event: 'agent_response', status: upstream.status, durationMs: Date.now() - started, bodyPreview: responseText.slice(0, 1000) });
      res.status(upstream.status);
      upstream.headers.forEach((v: string, k: string) => res.setHeader(k, v));
      res.end(responseText);
    } catch (e) {
      this.logger.error({ event: 'response_read_failed', error: String(e) });
      res.status(500).end('Response processing failed');
    }
  }
}




