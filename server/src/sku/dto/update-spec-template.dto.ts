import { IsOptional, IsString, IsArray } from 'class-validator';

export class UpdateSpecTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  options?: Record<string, unknown>[];
}
