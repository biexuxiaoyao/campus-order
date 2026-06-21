import { IsArray, IsString, ArrayMinSize } from 'class-validator';

export class BatchUpdateDto {
  @IsArray({ message: 'orderIds 须为数组' })
  @ArrayMinSize(1, { message: '至少需要一个订单ID' })
  @IsString({ each: true, message: '每个订单ID须为字符串' })
  orderIds: string[];

  @IsString({ message: '门店ID不能为空' })
  storeId: string;
}
