import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * 积分兑换 DTO
 */
export class ExchangeDto {
  @IsIn(['product', 'coupon'], {
    message: 'type 必须为 product 或 coupon',
  })
  type: 'product' | 'coupon';

  @IsOptional()
  @IsString({ message: 'productId 必须为字符串' })
  productId?: string;

  @IsOptional()
  @IsString({ message: 'couponTemplateId 必须为字符串' })
  couponTemplateId?: string;
}
