import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginationDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  // base64 cursor string; validated as opaque string with a practical size cap enforced by body size limits
  cursor?: string;
}

export class ThreadQueryDto {
  @IsString()
  threadId!: string;
}


