import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { Message, MessageDocument } from './schemas/message.schema';

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Conversation.name) private convs: Model<ConversationDocument>,
    @InjectModel(Message.name) private msgs: Model<MessageDocument>,
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
    const docs: Partial<Message>[] = [
      { userId, conversationId, threadId, turnId, role: 'user', content: user.content, raw: user },
      { userId, conversationId, threadId, turnId, role: 'agent_state', content: agentState.content, agentName: agentState.agentName, raw: agentState },
      { userId, conversationId, threadId, turnId, role: 'assistant', content: assistant.content, raw: assistant },
    ];
    await this.msgs.insertMany(docs);
    await this.convs.updateOne({ _id: conversationId }, { $set: { lastMessageAt: new Date() }, $inc: { messageCount: docs.length } });
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
}


