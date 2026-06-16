import { IsString, IsOptional, IsInt, IsIn } from 'class-validator';

export class CreateGroupOrderDto {
  @IsString({ message: '门店ID不能为空' })
  storeId: string;

  @IsOptional()
  @IsString()
  deadline?: string; // ISO datetime string

  @IsOptional()
  @IsIn(['A', 'B'], { message: '开团条件仅支持 A（满金额）或 B（满人数）' })
  condition?: string;

  @IsOptional()
  @IsInt({ message: '最低金额须为整数' })
  minAmount?: number;
}
