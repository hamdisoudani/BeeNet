import { Body, Controller, Delete, Get, Post, Query, Req, UseGuards, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { InitConversationDto } from './dto/init-conversation.dto';
import { IsString } from 'class-validator';
import { MessagesService } from './messages.service';
import { PaginationDto } from './dto/pagination.dto';

class DeleteConversationDto { @IsString() threadId!: string; }

@UseGuards(ClerkAuthGuard)
@Controller()
export class MessagesController {
  constructor(
    private readonly svc: MessagesService,
  ) {}

  @Post('conversations/init')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  async initConversation(@Req() req: any, @Body() body: InitConversationDto) {
    const userId = req.auth.userId as string;
    try {
      const result = await this.svc.initConversation(userId, body);
      try { await this.svc.invalidateConversationsCache(userId); } catch {}
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false };
    }
  }

  @Delete('conversations')
  async deleteConversation(@Req() req: any, @Body() body: DeleteConversationDto) {
    const userId = req.auth.userId as string;
    const { threadId } = body;
    try {
      const owned = await this.svc.isConversationOwnedBy(userId, threadId);
      if (!owned) throw new UnauthorizedException('conversation_not_found_or_not_owned');
      const result = await this.svc.deleteConversation(userId, threadId);
      try { await this.svc.invalidateConversationsCache(userId); } catch {}
      return result;
    } catch (e) {
      return { ok: false };
    }
  }

  @Get('conversations')
  async listConversations(@Req() req: any, @Query() q: PaginationDto) {
    const userId = req.auth.userId as string;
    const lim = Math.max(1, Math.min(50, Number(q?.limit || 20)));
    try {
      if (!q?.cursor) {
        // First page: serve from cache and support ETag
        const cached = await this.svc.getConversationsFirstPageCached(userId, lim);
        const clientTag = (req.headers?.['if-none-match'] as string | undefined) || undefined;
        if (clientTag && clientTag === cached.etag) {
          // 304 with empty body per HTTP spec; Nest will default to 200 if we return; so respond explicitly
          (req.res as any)?.status?.(304)?.end?.();
          return;
        }
        (req.res as any)?.setHeader?.('ETag', cached.etag);
        return { ok: true, conversations: cached.items, hasMore: cached.hasMore, nextCursor: cached.nextCursor } as any;
      }
      const { items, hasMore, nextCursor } = await this.svc.listConversationsPaged(userId, lim, q?.cursor);
      return { ok: true, conversations: items, hasMore, nextCursor };
    } catch (e) {
      return { ok: false, conversations: [], hasMore: false };
    }
  }
}


