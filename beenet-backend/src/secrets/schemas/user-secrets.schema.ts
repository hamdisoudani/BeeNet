import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: true, timestamps: false })
export class ModelConfigSubdoc {
  @Prop({ required: true })
  name!: string; // user-facing name like provider:model

  @Prop()
  provider?: string;

  @Prop()
  baseUrl?: string;

  @Prop()
  apiKey?: string; // legacy field; not used after encryption

  @Prop({ type: Object })
  apiKeyEnc?: any; // AES-GCM envelope

  @Prop()
  model?: string;
}

export const ModelConfigSchema = SchemaFactory.createForClass(ModelConfigSubdoc);

@Schema({ timestamps: true })
export class UserSecrets {
  @Prop({ required: true, unique: true })
  userId!: string;

  // Serper (replacement for Tavily)
  @Prop()
  serperApiKey?: string; // legacy field; will be unset on write

  @Prop({ type: Object })
  serperApiKeyEnc?: any;

  // Optional: multiple named model configs (per-user) with stable subdocument _id
  @Prop({ type: [ModelConfigSchema], required: false })
  models?: Array<ModelConfigSubdoc>;

  // Optional default model id for quick selection
  @Prop()
  defaultModelId?: string;
}

export type UserSecretsDocument = HydratedDocument<UserSecrets>;
export const UserSecretsSchema = SchemaFactory.createForClass(UserSecrets);




