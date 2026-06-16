import { IsInt, Min } from 'class-validator';

export class UpdateStockDto {
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
