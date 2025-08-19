import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SecretsController } from './secrets.controller';
import { SecretsService } from './secrets.service';
import { UserSecrets, UserSecretsSchema } from './schemas/user-secrets.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: UserSecrets.name, schema: UserSecretsSchema }])],
  controllers: [SecretsController],
  providers: [SecretsService],
  exports: [SecretsService],
})
export class SecretsModule {}


