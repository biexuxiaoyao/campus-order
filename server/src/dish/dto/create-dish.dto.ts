import {
  IsString,
  IsOptional,
  IsInt,
  IsDateString,
  Min,
} from 'class-validator';

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
  @IsInt()
  @Min(0)
  price?: number; // 默认SKU价格（分），不传则生成price=0的SKU

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number; // 默认SKU库存，默认0

  @IsOptional()
  @IsDateString()
  scheduledPublishAt?: string;

  @IsOptional()
  @IsDateString()
  scheduledUnpublishAt?: string;
}
