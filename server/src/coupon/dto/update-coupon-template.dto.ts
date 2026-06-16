import {
  IsString,
  IsIn,
  IsInt,
  IsOptional,
  IsDate,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 更新优惠券模板 DTO — 所有字段可选
 */
export class UpdateCouponTemplateDto {
  @IsOptional()
  @IsString({ message: 'name 必须为字符串' })
  name?: string;

  @IsOptional()
  @IsIn(['full_reduction', 'discount', 'product'], {
    message: 'type 必须为 full_reduction, discount 或 product',
  })
  type?: 'full_reduction' | 'discount' | 'product';

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'threshold 必须为整数' })
  threshold?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'value 必须为整数' })
  value?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'maxValue 必须为整数' })
  maxValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'totalQty 必须为整数' })
  totalQty?: number;

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
