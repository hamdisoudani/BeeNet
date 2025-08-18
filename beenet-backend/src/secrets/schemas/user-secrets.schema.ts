import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class UserSecrets {
  @Prop({ required: true, unique: true })
  userId!: string;

  @Prop()
  tavilyApiKey?: string; // legacy field; will be unset on write

  @Prop({ type: Object })
  tavilyApiKeyEnc?: any;

  // Optional: multiple named model configs (per-user). Kept simple for MVP.
  @Prop({ type: [Object], required: false })
  models?: Array<{
    // use Mongo subdocument _id implicitly
    name: string; // user-facing name
    provider?: string;
    baseUrl?: string;
    apiKey?: string; // legacy field
    apiKeyEnc?: any;
    model?: string;
  }>;

  // Optional default model id for quick selection
  @Prop()
  defaultModelId?: string;
}

export type UserSecretsDocument = HydratedDocument<UserSecrets>;
export const UserSecretsSchema = SchemaFactory.createForClass(UserSecrets);




