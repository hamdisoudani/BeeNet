import { IsOptional, IsString } from 'class-validator';

export class InitConversationDto {
  @IsOptional() @IsString() threadId?: string;
  @IsOptional() @IsString() title?: string;
}




