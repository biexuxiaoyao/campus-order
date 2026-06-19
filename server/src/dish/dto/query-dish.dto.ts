import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryDishDto extends PaginationDto {
  storeId?: string;
  categoryId?: string;
  keyword?: string;
  status?: string;
}
