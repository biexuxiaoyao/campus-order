import { IsString, IsIn, IsInt, IsOptional, IsDate } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 创建优惠券模板 DTO
 *
 * type values:
 * - full_reduction: 满减券, threshold 为门槛, value 为减免金额(分)
 * - discount: 折扣券, value 为折扣百分比(80 = 8折), maxValue 为最高优惠金额(分)
 * - product: 商品兑换券, value 为兑换商品价值(分)
 */
export class CreateCouponTemplateDto {
  @IsString({ message: 'name 为必填字符串' })
  name: string;

  @IsIn(['full_reduction', 'discount', 'product'], {
    message: 'type 必须为 full_reduction, discount 或 product',
  })
  type: 'full_reduction' | 'discount' | 'product';

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'threshold 必须为整数' })
  threshold?: number;

  @Type(() => Number)
  @IsInt({ message: 'value 必须为整数' })
  value: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'maxValue 必须为整数' })
  maxValue?: number;

  @Type(() => Number)
  @IsInt({ message: 'totalQty 必须为整数' })
  totalQty: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'validDays 必须为整数' })
  validDays?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'startAt 格式不正确' })
  startAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'endAt 格式不正确' })
  endAt?: Date;
}
