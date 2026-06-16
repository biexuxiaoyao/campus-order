import { IsArray, IsOptional, IsString, ArrayMinSize } from 'class-validator';

export class CreateOrderDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1, { message: '至少需要一个购物车项' })
  cartItemIds: string[];

  @IsOptional()
  @IsString()
  pickupTime?: string;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;
}
