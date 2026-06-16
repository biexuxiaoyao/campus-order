import { IsString, IsOptional, IsIn, MinLength } from 'class-validator';

export class CreateStaffDto {
  @IsString()
  username: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @IsIn(['owner', 'manager', 'cashier', 'chef'])
  role: string;

  @IsOptional()
  @IsString()
  storeId?: string;
}
