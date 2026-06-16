import { IsString, IsNotEmpty } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty({ message: 'appId 不能为空' })
  appId: string;

  @IsString()
  @IsNotEmpty({ message: '名称不能为空' })
  name: string;
}
