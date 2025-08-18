import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class Conversation {
  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  threadId!: string;

  @Prop()
  title?: string;

  @Prop({ default: 'active' })
  status?: 'active' | 'archived' | 'deleted';

  @Prop()
  lastMessageAt?: Date;

  @Prop({ default: 0 })
  messageCount?: number;

  @Prop({ type: Object })
  metadata?: any;
}

export type ConversationDocument = HydratedDocument<Conversation>;
export const ConversationSchema = SchemaFactory.createForClass(Conversation);

ConversationSchema.index({ userId: 1, updatedAt: -1 });
ConversationSchema.index({ userId: 1, threadId: 1 }, { unique: true });




