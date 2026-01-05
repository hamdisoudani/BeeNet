import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Conversation.name) private convs: Model<ConversationDocument>,
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

  async deleteConversation(userId: string, threadId: string) {
    const conv = await this.convs.findOne({ userId, threadId });
    if (!conv) {
      return { ok: true } as const;
    }
    // Soft delete conversation metadata
    await this.convs.updateOne(
      { _id: conv._id },
      { $set: { status: 'deleted', messageCount: 0, lastMessageAt: new Date() } },
    );
    return { ok: true, deleted: 1 } as const;
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


