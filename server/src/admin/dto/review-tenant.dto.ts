import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ReviewTenantDto {
  @IsBoolean()
  approved: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}
