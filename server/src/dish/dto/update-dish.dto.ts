import { IsString, IsOptional, IsDateString, IsIn } from 'class-validator';

export class UpdateDishDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  @IsIn(['draft', 'published', 'offline'])
  status?: string;

  @IsOptional()
  @IsDateString()
  scheduledPublishAt?: string;

  @IsOptional()
  @IsDateString()
  scheduledUnpublishAt?: string;
}
