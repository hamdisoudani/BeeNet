import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument } from '../messages/schemas/conversation.schema';
import { Message, MessageDocument } from '../messages/schemas/message.schema';
import { UserSecrets, UserSecretsDocument } from '../secrets/schemas/user-secrets.schema';

@Injectable()
export class ProxyService {
  constructor(
    @InjectModel(Conversation.name) private convs: Model<ConversationDocument>,
    @InjectModel(Message.name) private msgs: Model<MessageDocument>,
    @InjectModel(UserSecrets.name) private secrets: Model<UserSecretsDocument>,
  ) {}

  async findOrCreateConversation(userId: string, threadId: string): Promise<Types.ObjectId> {
    const now = new Date();
    const conv = await this.convs.findOneAndUpdate(
      { userId, threadId },
      { $setOnInsert: { userId, threadId }, $set: { lastMessageAt: now } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return conv._id as Types.ObjectId;
  }

  async persistUserMessage(params: {
    userId: string;
    conversationId: Types.ObjectId;
    threadId: string;
    turnId: string;
    content: string;
    messageId?: string;
  }): Promise<void> {
    const { userId, conversationId, threadId, turnId, content, messageId } = params;
    // Idempotent upsert per (conversationId, turnId, role)
    await this.msgs.updateOne(
      { conversationId, turnId, role: 'user' },
      {
        $set: {
          userId,
          conversationId,
          threadId,
          turnId,
          role: 'user',
          content,
          messageId,
        },
      },
      { upsert: true },
    );
  }

  async persistAssistantState(params: {
    userId: string;
    conversationId: Types.ObjectId;
    threadId: string;
    turnId: string;
    agentName?: string;
    rawState: any;
  }): Promise<void> {
    const { userId, conversationId, threadId, turnId, agentName, rawState } = params;
    // Save a compact state: plan plus an optional sanitized error
    let compact: any = undefined;
    try {
      const p = rawState?.plan;
      const plan = p && typeof p === 'object' ? { mode: p.mode, steps: p.steps, reason: p.reason } : undefined;
      let err: any = undefined;
      try {
        const e = rawState?.error;
        if (e && typeof e === 'object') {
          // Keep only user-safe fields
          const type = typeof e.type === 'string' ? e.type : undefined;
          const message = typeof e.message === 'string' ? e.message : undefined;
          const codes = Array.isArray(e.codes) ? e.codes.slice(0, 3).map((x: any) => String(x)) : undefined;
          if (type || message || codes) err = { ...(type ? { type } : {}), ...(message ? { message } : {}), ...(codes ? { codes } : {}) };
        }
      } catch {}
      if (plan || err) compact = { ...(plan ? { plan } : {}), ...(err ? { error: err } : {}) };
    } catch {}
    await this.msgs.create({
      userId,
      conversationId,
      threadId,
      turnId,
      role: 'assistant',
      agentName,
      state: compact,
    });
  }

  async persistAssistantText(params: {
    userId: string;
    conversationId: Types.ObjectId;
    threadId: string;
    turnId: string;
    agentName?: string;
    content: string;
    messageId?: string;
  }): Promise<void> {
    const { userId, conversationId, threadId, turnId, agentName, content, messageId } = params;
    await this.msgs.create({
      userId,
      conversationId,
      threadId,
      turnId,
      role: 'assistant',
      agentName,
      content,
      messageId,
      parentMessageId: messageId,
    });
  }

  async updateConversationOnCreate(conversationId: Types.ObjectId, createdCount: number): Promise<void> {
    if (!createdCount) return;
    await this.convs.updateOne(
      { _id: conversationId },
      { $set: { lastMessageAt: new Date() }, $inc: { messageCount: createdCount } },
    );
  }

  async getUserSecrets(userId: string): Promise<Partial<UserSecrets>> {
    const doc = await this.secrets.findOne({ userId }).lean();
    // shape: return models with decrypted apiKey for proxy injection; include tavily flag
    const out: any = {};
    if (!doc) return out;
    const arr = Array.isArray((doc as any).models) ? (doc as any).models : [];
    out.models = arr.map((m: any) => ({
      id: String(m?._id || m?.id || ''),
      name: m?.name,
      provider: m?.provider,
      baseUrl: m?.baseUrl,
      model: m?.model,
      // The controller will only read apiKey (string) if present; keep legacy pass-through for now
      apiKey: (m as any)?.apiKey,
    }));
    out.tavilyApiKey = (doc as any)?.tavilyApiKey; // legacy; controller sets header if present
    return out as Partial<UserSecrets>;
  }
}


