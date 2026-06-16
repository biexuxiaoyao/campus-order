import { IsArray, ValidateNested, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class BatchSortItem {
  @IsString({ message: 'id 必须为字符串' })
  id: string;

  @Type(() => Number)
  @IsInt({ message: 'sortOrder 必须为整数' })
  @Min(0, { message: 'sortOrder 最小值为 0' })
  sortOrder: number;
}

export class BatchSortDto {
  @IsArray({ message: 'items 必须为数组' })
  @ValidateNested({ each: true })
  @Type(() => BatchSortItem)
  items: BatchSortItem[];
}
