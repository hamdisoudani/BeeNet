import { Body, Controller, Delete, Get, Post, Query, Req, UseGuards, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { Message, MessageDocument } from './schemas/message.schema';
import { InitConversationDto } from './dto/init-conversation.dto';
import { PersistTurnDto } from './dto/persist-turn.dto';
import { IsString } from 'class-validator';
import { MessagesService } from './messages.service';

class DeleteTurnDto { @IsString() threadId!: string; @IsString() turnId!: string; }

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
      return { ok: true, ...result };
    } catch {
      return { ok: false };
    }
  }

  @Post('messages/turn')
  async persistTurn(@Req() req: any, @Body() body: PersistTurnDto) {
    const userId = req.auth.userId as string;
    const { threadId, turnId, user, agentState, assistant } = body;
    try {
      const result = await this.svc.persistTurnGroup(userId, { threadId, turnId, user, agentState, assistant });
      return result;
    } catch {
      return { ok: false };
    }
  }

  @Delete('messages/turn')
  async deleteTurn(@Req() req: any, @Body() body: DeleteTurnDto) {
    const userId = req.auth.userId as string;
    const { threadId, turnId } = body;
    try {
      return await this.svc.deleteTurn(userId, threadId, turnId);
    } catch {
      return { ok: false };
    }
  }

  @Get('messages')
  async listMessages(@Req() req: any, @Query('threadId') threadId?: string) {
    const userId = req.auth.userId as string;
    if (!threadId) {
      throw new BadRequestException('threadId_required');
    }
    const owned = await this.svc.isConversationOwnedBy(userId, threadId);
    if (!owned) {
      // Explicit 401 per requirement when conversation doesn't exist or is not owned
      throw new UnauthorizedException('conversation_not_found_or_not_owned');
    }
    const conv = await this.svc.getConversationByThread(userId, threadId);
    const messages = await this.svc.listMessages(userId, threadId);
    return { ok: true, messages, threadId: conv?.threadId };
  }

  @Get('conversations')
  async listConversations(@Req() req: any) {
    const userId = req.auth.userId as string;
    const conversations = await this.svc.listConversations(userId);
    return { ok: true, conversations };
  }
}


