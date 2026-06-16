import { IsString, IsOptional, IsDateString } from 'class-validator';

export class CreateDishDto {
  @IsString()
  name: string;

  @IsString()
  categoryId: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsDateString()
  scheduledPublishAt?: string;

  @IsOptional()
  @IsDateString()
  scheduledUnpublishAt?: string;
}
