import { IsString, IsArray } from 'class-validator';

export class CreateSpecTemplateDto {
  @IsString()
  name: string;

  @IsArray()
  options: Record<string, unknown>[];
}
