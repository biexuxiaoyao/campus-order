import { IsArray, IsString, IsInt, IsOptional, ArrayMinSize } from 'class-validator';

class JoinItemDto {
  @IsString({ message: 'SKU ID不能为空' })
  skuId: string;

  @IsInt({ message: '数量须为整数' })
  quantity: number;

  @IsOptional()
  @IsString()
  dishName?: string;

  @IsOptional()
  @IsString()
  specName?: string;

  @IsOptional()
  @IsInt({ message: '价格须为整数（分）' })
  price?: number;
}

export class JoinGroupOrderDto {
  @IsArray({ message: 'items 须为数组' })
  @ArrayMinSize(1, { message: '至少需要一个团购项' })
  items: JoinItemDto[];
}
