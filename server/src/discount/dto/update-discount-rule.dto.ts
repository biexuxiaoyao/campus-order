import {
  IsString,
  IsObject,
  IsInt,
  IsBoolean,
  IsOptional,
  IsDate,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 更新折扣规则 DTO — 所有字段可选
 */
export class UpdateDiscountRuleDto {
  @IsOptional()
  @IsString({ message: 'name 必须为字符串' })
  name?: string;

  @IsOptional()
  @IsObject({ message: 'conditions 必须为 JSON 对象' })
  conditions?: Record<string, any>;

  @IsOptional()
  @IsObject({ message: 'actions 必须为 JSON 对象' })
  actions?: Record<string, any>;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'priority 必须为整数' })
  priority?: number;

  @IsOptional()
  @IsBoolean({ message: 'isStackable 必须为布尔值' })
  isStackable?: boolean;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'startAt 格式不正确' })
  startAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'endAt 格式不正确' })
  endAt?: Date;
}
