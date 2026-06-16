import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 分页查询参数
 */
export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page 必须为整数' })
  @Min(1, { message: 'page 最小值为 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize 必须为整数' })
  @Min(1, { message: 'pageSize 最小值为 1' })
  @Max(100, { message: 'pageSize 最大值为 100' })
  pageSize?: number = 20;
}

/**
 * 分页响应元数据
 */
export interface PaginationMeta {
  total: number;
  hasMore: boolean;
}

/**
 * 分页响应结构
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}
