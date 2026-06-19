import { IsOptional, IsString, IsEnum } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryTenantDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @IsEnum(['active', 'expired', 'deleted', ''])
  status?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  appId?: string;
}
