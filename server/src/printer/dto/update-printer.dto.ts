import { IsOptional, IsString, IsIn } from 'class-validator';

export class UpdatePrinterDto {
  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive', 'offline'], {
    message: '状态必须是 active、inactive 或 offline',
  })
  status?: string;
}
