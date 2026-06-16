import { IsOptional, IsArray, IsInt, IsString, Min } from 'class-validator';

export class UpdateSkuDto {
  @IsOptional()
  @IsArray()
  specs?: Record<string, unknown>[];

  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  availableStock?: number;

  @IsOptional()
  @IsString()
  status?: string;
}
