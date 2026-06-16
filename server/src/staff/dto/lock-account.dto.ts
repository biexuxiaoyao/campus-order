import { IsNumber, Min } from 'class-validator';

export class LockAccountDto {
  @IsNumber()
  @Min(1)
  minutes: number;
}
