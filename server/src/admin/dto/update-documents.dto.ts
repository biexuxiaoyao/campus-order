import { IsOptional, IsString } from 'class-validator';

export class UpdateDocumentsDto {
  @IsOptional()
  @IsString()
  bizLicenseUrl?: string;

  @IsOptional()
  @IsString()
  foodPermitUrl?: string;

  @IsOptional()
  @IsString()
  idCardUrl?: string;

  @IsOptional()
  @IsString()
  storePhotoUrl?: string;
}
