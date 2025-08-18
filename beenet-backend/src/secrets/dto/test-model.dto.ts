import { IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

export class TestModelDto {
  @IsOptional() @IsString({ message: 'provider must be a string' })
  provider?: string;

  @IsUrl({}, { message: 'baseUrl must be a valid URL' })
  baseUrl!: string;

  @IsString({ message: 'model is required' }) @MinLength(2, { message: 'model must have at least 2 characters' })
  model!: string;

  @IsString({ message: 'apiKey is required' }) @MinLength(8, { message: 'apiKey looks too short' })
  apiKey!: string;
}



