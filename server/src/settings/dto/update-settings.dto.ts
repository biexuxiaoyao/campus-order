import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  hours?: string;

  @IsOptional()
  @IsBoolean()
  paused?: boolean;

  @IsOptional()
  @IsString()
  pauseReason?: string;

  @IsOptional()
  @IsBoolean()
  autoPrint?: boolean;
}
