import { IsString, IsEnum, IsOptional, IsISO8601 } from 'class-validator';

export class UpdateLicenseDto {
  @IsString()
  @IsEnum(['issue', 'revoke'])
  action: 'issue' | 'revoke';

  @IsOptional()
  @IsISO8601()
  newExpireAt?: string;
}
