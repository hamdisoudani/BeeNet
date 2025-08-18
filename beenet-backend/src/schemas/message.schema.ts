import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MessageRole = 'user' | 'assistant' | 'agent_state';

@Schema({ timestamps: true })
export class Message {
  @Prop({ required: true })
  userId!: string;

  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true })
  conversationId!: Types.ObjectId;

  @Prop({ required: true })
  threadId!: string;

  @Prop({ required: true })
  turnId!: string;

  @Prop({ required: true })
  role!: MessageRole;

  @Prop({ required: true })
  content!: string;

  @Prop()
  agentName?: string;

  @Prop({ type: Object })
  raw?: any;
}

export type MessageDocument = HydratedDocument<Message>;
export const MessageSchema = SchemaFactory.createForClass(Message);

MessageSchema.index({ conversationId: 1, createdAt: 1 });
MessageSchema.index({ conversationId: 1, turnId: 1 });




