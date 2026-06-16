import { IsOptional, IsIn } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * 预充值交易流水查询参数
 */
export class QueryTransactionDto extends PaginationDto {
  @IsOptional()
  @IsIn(['purchase', 'consume', 'refund'], {
    message: 'type 必须为 purchase, consume 或 refund',
  })
  type?: string;
}
