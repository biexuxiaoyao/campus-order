import { IsString, IsIn, IsNotEmpty } from 'class-validator';

export class PrepayDto {
  @IsString()
  @IsNotEmpty({ message: '订单 ID 不能为空' })
  orderId!: string;

  @IsString()
  @IsIn(['wechat', 'balance'], { message: '支付渠道必须为 wechat 或 balance' })
  channel!: 'wechat' | 'balance';
}
