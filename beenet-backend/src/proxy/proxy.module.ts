import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';
import { UserSecrets, UserSecretsSchema } from '../secrets/schemas/user-secrets.schema';
import { AppLogger } from '../common/logger.service';
import { Conversation, ConversationSchema } from '../messages/schemas/conversation.schema';
import { Message, MessageSchema } from '../messages/schemas/message.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserSecrets.name, schema: UserSecretsSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
  ],
  controllers: [ProxyController],
  providers: [AppLogger, ProxyService],
})
export class ProxyModule {}


