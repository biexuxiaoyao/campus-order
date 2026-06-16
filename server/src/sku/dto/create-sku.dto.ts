import { IsOptional, IsArray, IsInt, Min } from 'class-validator';

export class CreateSkuDto {
  @IsOptional()
  @IsArray()
  specs?: Record<string, unknown>[];

  @IsInt()
  @Min(0)
  price: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  availableStock?: number;
}
