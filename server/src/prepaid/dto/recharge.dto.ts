import { IsInt, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 预充值 DTO — amount 单位为元，service 层转换为分
 */
export class RechargeDto {
  @Type(() => Number)
  @IsInt({ message: 'amount 必须为整数' })
  @Min(1, { message: 'amount 最小值为 1' })
  amount: number;

  @IsIn(['personal', 'company'], {
    message: 'type 必须为 personal 或 company',
  })
  type: 'personal' | 'company';
}
