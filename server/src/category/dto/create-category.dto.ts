import { IsString, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCategoryDto {
  @IsString({ message: '分类名称必须为字符串' })
  name: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'sortOrder 必须为整数' })
  @Min(0, { message: 'sortOrder 最小值为 0' })
  sortOrder?: number = 0;
}
