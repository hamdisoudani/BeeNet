import { IsArray, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertSecretsDto {
  @IsOptional() @IsString() tavilyApiKey?: string;

  @IsOptional() @IsArray()
  @Type(() => Object)
  models?: Array<{
    id?: string;
    name?: string;
    provider?: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  }>;

  @IsOptional() @IsString()
  defaultModelId?: string;

  // When true, backend will set defaultModelId to the newly created model
  @IsOptional()
  setDefaultForNew?: boolean;
}




