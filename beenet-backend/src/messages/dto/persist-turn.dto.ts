import { ValidateNested, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class TurnMessageDto {
  @IsString() id!: string;
  @IsString() content!: string;
}

export class TurnAgentStateDto {
  @IsString() agentName!: string;
  @IsString() content!: string;
}

export class PersistTurnDto {
  @IsString() threadId!: string;
  @IsString() turnId!: string;
  @ValidateNested() @Type(() => TurnMessageDto) user!: TurnMessageDto;
  @ValidateNested() @Type(() => TurnAgentStateDto) agentState!: TurnAgentStateDto;
  @ValidateNested() @Type(() => TurnMessageDto) assistant!: TurnMessageDto;
}




