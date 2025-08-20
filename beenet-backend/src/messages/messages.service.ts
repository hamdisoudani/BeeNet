import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { Message, MessageDocument } from './schemas/message.schema';

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Conversation.name) private convs: Model<ConversationDocument>,
    @InjectModel(Message.name) private msgs: Model<MessageDocument>,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  async initConversation(userId: string, input: { threadId?: string; title?: string }) {
    let { threadId, title } = input || {};
    if (!threadId || typeof threadId !== 'string' || threadId.trim().length < 8) {
      threadId = require('crypto').randomUUID();
    }
    if (title) title = String(title).trim().slice(0, 120);
    const now = new Date();
    const res = await this.convs.findOneAndUpdate(
      { userId, threadId },
      { $setOnInsert: { userId, threadId, title, createdBy: userId }, $set: { lastMessageAt: now } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    return { conversationId: res?._id?.toString(), threadId, title: res?.title };
  }

  async listMessages(userId: string, threadId: string) {
    const conv = await this.convs.findOne({ userId, threadId });
    if (!conv) return [] as any[];
    const items = await this.msgs.find({ conversationId: conv._id }).sort({ createdAt: 1 }).lean();
    // Return CopilotKit-native messages if present on docs; otherwise derive minimally
    const out: any[] = [];
    for (const m of items as any[]) {
      const raw = (m?.raw && typeof m.raw === 'object') ? m.raw : undefined;
      const role: string = m?.role;
      if (raw && typeof raw.role === 'string') {
        // Trust the raw envelope if present
        out.push({ ...raw, turnId: m?.turnId });
        continue;
      }
      if (role === 'assistant' && m?.state && typeof m.state === 'object') {
        out.push({ id: String(m?._id ?? m?.turnId ?? ''), role: 'assistant', agentName: m?.agentName, state: m.state, turnId: m?.turnId });
        continue;
      }
      if (role === 'assistant') {
        out.push({ id: String(m?.raw?.id ?? m?._id ?? m?.turnId ?? ''), role: 'assistant', content: String(m?.content ?? ''), turnId: m?.turnId });
        continue;
      }
      if (role === 'user') {
        out.push({ id: String(m?.raw?.id ?? m?._id ?? m?.turnId ?? ''), role: 'user', content: String(m?.content ?? ''), turnId: m?.turnId });
        continue;
      }
    }
    return out;
  }

  async listMessagesPaged(userId: string, threadId: string, limit: number, cursor?: string) {
    const conv = await this.convs.findOne({ userId, threadId }).select({ _id: 1 }).lean();
    if (!conv) return { items: [], hasMore: false, nextCursor: undefined } as const;
    const pageSize = Math.max(1, Math.min(100, Number.isFinite(limit as any) ? Number(limit) : 40));
    const baseFilter: any = { conversationId: conv._id };
    let filter: any = { ...baseFilter };
    try {
      if (cursor && typeof cursor === 'string' && cursor.trim()) {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as { createdAt?: string; _id?: string };
        if (decoded?.createdAt && decoded?._id) {
          const ts = new Date(decoded.createdAt);
          const oid = new Types.ObjectId(String(decoded._id));
          filter = {
            ...baseFilter,
            $or: [
              { createdAt: { $gt: ts } },
              { createdAt: ts, _id: { $gt: oid } },
            ],
          };
        }
      }
    } catch {}
    const sort: any = { createdAt: 1, _id: 1 };
    const docs = await this.msgs
      .find(filter)
      .sort(sort)
      .limit(pageSize + 1)
      .lean();
    const hasMore = docs.length > pageSize;
    const page = hasMore ? docs.slice(0, pageSize) : docs;
    const items = await (async () => {
      // Map to CopilotKit-friendly envelope similar to listMessages
      const out: any[] = [];
      for (const m of page as any[]) {
        const raw = (m?.raw && typeof m.raw === 'object') ? m.raw : undefined;
        const role: string = m?.role;
        if (raw && typeof raw.role === 'string') {
          out.push({ ...raw, turnId: m?.turnId });
          continue;
        }
        if (role === 'assistant' && m?.state && typeof m.state === 'object') {
          out.push({ id: String(m?._id ?? m?.turnId ?? ''), role: 'assistant', agentName: m?.agentName, state: m.state, turnId: m?.turnId });
          continue;
        }
        if (role === 'assistant') {
          out.push({ id: String(m?.raw?.id ?? m?._id ?? m?.turnId ?? ''), role: 'assistant', content: String(m?.content ?? ''), turnId: m?.turnId });
          continue;
        }
        if (role === 'user') {
          out.push({ id: String(m?.raw?.id ?? m?._id ?? m?.turnId ?? ''), role: 'user', content: String(m?.content ?? ''), turnId: m?.turnId });
          continue;
        }
      }
      return out;
    })();
    let nextCursor: string | undefined;
    if (hasMore && page.length > 0) {
      const tail: any = page[page.length - 1];
      try {
        nextCursor = Buffer.from(JSON.stringify({ createdAt: tail.createdAt, _id: tail._id?.toString?.() || String(tail._id) })).toString('base64');
      } catch {}
    }
    return { items, hasMore, nextCursor } as const;
  }

  private computeMessagesEtag(items: any[]): string {
    try {
      const crypto = require('node:crypto');
      const basis = items.map((m: any) => `${m?.id || ''}|${m?.turnId || ''}`).join(';');
      return crypto.createHash('sha1').update(basis).digest('hex');
    } catch {
      return `${items.length}`;
    }
  }

  async getMessagesFirstPageCached(userId: string, threadId: string, limit: number) {
    const key = `msgs:first:${userId}:${threadId}:lim:${limit}`;
    let cached: any = await this.cache.get(key);
    if (cached && typeof cached === 'object') return cached;
    const page = await this.listMessagesPaged(userId, threadId, limit, undefined);
    const etag = this.computeMessagesEtag(page.items as any[]);
    const payload = { ...page, etag };
    await this.cache.set(key, payload, 60_000);
    return payload;
  }

  async getConversationByThread(userId: string, threadId: string) {
    return this.convs.findOne({ userId, threadId }).lean();
  }

  async isConversationOwnedBy(userId: string, threadId: string): Promise<boolean> {
    const conv = await this.convs
      .findOne({ userId, threadId })
      .select({ _id: 1, createdBy: 1 })
      .lean();
    if (!conv) return false;
    if (conv?.createdBy && conv.createdBy !== userId) return false;
    return true;
  }

  async persistTurnGroup(userId: string, params: { threadId: string; turnId: string; user: any; agentState: any; assistant: any; }) {
    const { threadId, turnId, user, agentState, assistant } = params;
    const conv = await this.convs.findOne({ userId, threadId });
    if (!conv) return { ok: false, error: 'conversation_not_found' } as const;
    const conversationId = conv._id as Types.ObjectId;
    const safe = (v: any) => (v && typeof v === 'string' ? v : undefined);
    const safeObj = (v: any) => (v && typeof v === 'object' ? v : undefined);
    const docs: Partial<Message>[] = [
      {
        userId,
        conversationId,
        threadId,
        turnId,
        role: 'user',
        content: safe(user?.content) || '',
        raw: safeObj(user),
      },
      {
        userId,
        conversationId,
        threadId,
        turnId,
        role: 'agent_state',
        content: safe(agentState?.content) || '',
        agentName: safe(agentState?.agentName),
        raw: safeObj(agentState),
      },
      {
        userId,
        conversationId,
        threadId,
        turnId,
        role: 'assistant',
        content: safe(assistant?.content) || '',
        raw: safeObj(assistant),
      },
    ];
    await this.msgs.insertMany(docs);
    await this.convs.updateOne(
      { _id: conversationId },
      { $set: { lastMessageAt: new Date() }, $inc: { messageCount: docs.length } },
    );
    return { ok: true } as const;
  }

  async deleteTurn(userId: string, threadId: string, turnId: string) {
    const conv = await this.convs.findOne({ userId, threadId });
    if (!conv) return { ok: true } as const;
    const res = await this.msgs.deleteMany({ conversationId: conv._id, turnId });
    if (res?.deletedCount) {
      await this.convs.updateOne({ _id: conv._id }, { $inc: { messageCount: -res.deletedCount } });
    }
    return { ok: true } as const;
  }

  async deleteConversation(userId: string, threadId: string) {
    const conv = await this.convs.findOne({ userId, threadId });
    if (!conv) {
      return { ok: true } as const;
    }
    // Set-based bulk delete on indexed key to avoid client-side loops
    const res = await this.msgs.deleteMany({ conversationId: conv._id });
    await this.convs.updateOne(
      { _id: conv._id },
      { $set: { status: 'deleted', messageCount: 0, lastMessageAt: new Date() } },
    );
    return { ok: true, deleted: res?.deletedCount || 0 } as const;
  }
  async listConversations(userId: string) {
    const items = await this.convs
      .find({ userId, status: { $ne: 'deleted' } })
      .sort({ updatedAt: -1 })
      .select({ _id: 1, threadId: 1, title: 1, lastMessageAt: 1, messageCount: 1 })
      .lean();
    return items.map((c: any) => ({
      conversationId: c._id?.toString(),
      threadId: c.threadId,
      title: c.title,
      lastMessageAt: c.lastMessageAt,
      messageCount: c.messageCount,
    }));
  }

  async listConversationsPaged(userId: string, limit: number, cursor?: string) {
    const pageSize = Math.max(1, Math.min(50, Number.isFinite(limit as any) ? Number(limit) : 20));
    const baseFilter: any = { userId, status: { $ne: 'deleted' } };
    let filter: any = { ...baseFilter };
    try {
      if (cursor && typeof cursor === 'string' && cursor.trim()) {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as { lastMessageAt?: string; _id?: string };
        if (decoded?.lastMessageAt && decoded?._id) {
          const ts = new Date(decoded.lastMessageAt);
          const oid = new Types.ObjectId(String(decoded._id));
          filter = {
            ...baseFilter,
            $or: [
              { lastMessageAt: { $lt: ts } },
              { lastMessageAt: ts, _id: { $lt: oid } },
            ],
          };
        }
      }
    } catch {}
    const sort: any = { lastMessageAt: -1, _id: -1 };
    const docs = await this.convs
      .find(filter)
      .sort(sort)
      .limit(pageSize + 1)
      .select({ _id: 1, threadId: 1, title: 1, lastMessageAt: 1, messageCount: 1 })
      .lean();

    const hasMore = docs.length > pageSize;
    const page = hasMore ? docs.slice(0, pageSize) : docs;
    const items = page.map((c: any) => ({
      conversationId: c._id?.toString(),
      threadId: c.threadId,
      title: c.title,
      lastMessageAt: c.lastMessageAt,
      messageCount: c.messageCount,
    }));
    let nextCursor: string | undefined;
    if (hasMore && page.length > 0) {
      const tail = page[page.length - 1];
      try {
        nextCursor = Buffer.from(JSON.stringify({ lastMessageAt: tail.lastMessageAt, _id: tail._id?.toString?.() || String(tail._id) })).toString('base64');
      } catch {}
    }
    return { items, hasMore, nextCursor } as const;
  }

  private computeFirstPageEtag(items: any[]): string {
    try {
      const crypto = require('node:crypto');
      const basis = items.map((c: any) => `${c.threadId}|${new Date(c.lastMessageAt || 0).getTime()}`).join(';');
      return crypto.createHash('sha1').update(basis).digest('hex');
    } catch {
      return `${items.length}`;
    }
  }

  async getConversationsFirstPageCached(userId: string, limit: number) {
    const cacheKey = `conv:first:${userId}:lim:${limit}`;
    let cached: any = await this.cache.get(cacheKey);
    if (cached && typeof cached === 'object') return cached;
    const page = await this.listConversationsPaged(userId, limit, undefined);
    const etag = this.computeFirstPageEtag(page.items as any[]);
    const payload = { ...page, etag };
    await this.cache.set(cacheKey, payload, 60_000);
    return payload;
  }

  async invalidateConversationsCache(userId: string) {
    // Best-effort: clear common limits we use in the app
    try { await this.cache.del(`conv:first:${userId}:lim:20`); } catch {}
    try { await this.cache.del(`conv:first:${userId}:lim:50`); } catch {}
  }
}


