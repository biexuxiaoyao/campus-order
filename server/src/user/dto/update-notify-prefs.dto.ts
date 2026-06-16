import { IsBoolean, IsObject, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class NotifyPrefsObject {
  @IsOptional()
  @IsBoolean()
  pickRemind?: boolean;

  @IsOptional()
  @IsBoolean()
  newOrder?: boolean;

  @IsOptional()
  @IsBoolean()
  refundResult?: boolean;

  @IsOptional()
  @IsBoolean()
  promotion?: boolean;

  @IsOptional()
  @IsBoolean()
  groupProgress?: boolean;
}

export class UpdateNotifyPrefsDto {
  @IsObject()
  @Type(() => NotifyPrefsObject)
  prefs: NotifyPrefsObject;
}
