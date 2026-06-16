import { IsString, IsInt, Min, IsOptional } from 'class-validator';

export class AddCartItemDto {
  @IsString()
  skuId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number = 1;
}
