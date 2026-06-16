import { IsString, IsNotEmpty, IsObject, IsOptional } from 'class-validator';

export class CreateDeliveryDto {
  @IsString()
  @IsNotEmpty({ message: 'tenantId 不能为空' })
  tenantId: string;

  @IsString()
  @IsNotEmpty({ message: 'version 不能为空' })
  version: string;

  @IsObject()
  modules: Record<string, unknown>;

  @IsString()
  @IsNotEmpty({ message: 'watermarkId 不能为空' })
  watermarkId: string;

  @IsOptional()
  @IsString()
  checksum?: string;

  @IsOptional()
  @IsString()
  deliveredAt?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}
