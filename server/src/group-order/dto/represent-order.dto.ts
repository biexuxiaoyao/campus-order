import {
  IsArray,
  IsString,
  IsInt,
  IsNotEmpty,
  ArrayMinSize,
} from 'class-validator';

class RepresentItemDto {
  @IsString({ message: 'SKU ID不能为空' })
  skuId: string;

  @IsInt({ message: '数量须为整数' })
  quantity: number;

  @IsString({ message: '收餐人姓名不能为空' })
  @IsNotEmpty({ message: '收餐人姓名不能为空' })
  recipientName: string;
}

export class RepresentOrderDto {
  @IsString({ message: '门店ID不能为空' })
  @IsNotEmpty({ message: '门店ID不能为空' })
  storeId: string;

  @IsArray({ message: 'items 须为数组' })
  @ArrayMinSize(1, { message: '至少需要一个团购项' })
  items: RepresentItemDto[];
}
