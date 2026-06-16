import { IsOptional, IsString, IsArray, ArrayMaxSize } from 'class-validator';

export class UpdateBrandConfigDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  themeColor?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  banners?: string[];

  @IsOptional()
  @IsString()
  hours?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
