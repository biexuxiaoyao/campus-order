import { IsString, IsIn, IsOptional } from 'class-validator';

export const ORDER_STATUSES = [
  'pending',
  'paid',
  'confirmed',
  'cooking',
  'ready',
  'picked',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export class UpdateOrderStatusDto {
  @IsString()
  @IsIn(ORDER_STATUSES, { message: '无效的订单状态' })
  status: OrderStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}
