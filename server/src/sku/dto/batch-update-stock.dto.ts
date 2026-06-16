import { IsArray, ValidateNested, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

class BatchStockItem {
  @IsString()
  id: string;

  @IsInt()
  @Min(0)
  stock: number;

  @IsInt()
  @Min(0)
  availableStock: number;

  @IsInt()
  @Min(0)
  version: number;
}

export class BatchUpdateStockDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchStockItem)
  items: BatchStockItem[];
}
