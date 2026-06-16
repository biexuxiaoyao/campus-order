import { IsOptional, IsString, IsEnum, IsISO8601 } from 'class-validator';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @IsEnum(['active', 'expired', 'deleted'])
  status?: string;

  @IsOptional()
  @IsISO8601()
  expireAt?: string;
}
