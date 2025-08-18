import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class UserSecrets {
  @Prop({ required: true, unique: true })
  userId!: string;

  @Prop()
  openaiApiKey?: string;

  @Prop()
  openaiBaseUrl?: string;

  @Prop()
  openaiModel?: string;

  @Prop()
  tavilyApiKey?: string;
}

export type UserSecretsDocument = HydratedDocument<UserSecrets>;
export const UserSecretsSchema = SchemaFactory.createForClass(UserSecrets);




