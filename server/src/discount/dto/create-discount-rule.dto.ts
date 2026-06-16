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
 * 创建折扣规则 DTO
 */
export class CreateDiscountRuleDto {
  @IsString({ message: 'name 为必填字符串' })
  name: string;

  @IsObject({ message: 'conditions 必须为 JSON 对象' })
  conditions: Record<string, any>;

  @IsObject({ message: 'actions 必须为 JSON 对象' })
  actions: Record<string, any>;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'priority 必须为整数' })
  priority?: number = 0;

  @IsOptional()
  @IsBoolean({ message: 'isStackable 必须为布尔值' })
  isStackable?: boolean = false;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'startAt 格式不正确' })
  startAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'endAt 格式不正确' })
  endAt?: Date;
}
