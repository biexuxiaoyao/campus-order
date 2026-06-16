import { IsString, IsNotEmpty, IsObject } from 'class-validator';

export class CorrectDataDto {
  @IsString()
  @IsNotEmpty({ message: 'targetType 不能为空' })
  targetType: string;

  @IsString()
  @IsNotEmpty({ message: 'targetId 不能为空' })
  targetId: string;

  @IsObject()
  corrections: Record<string, unknown>;

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  password: string;

  @IsString()
  @IsNotEmpty({ message: '原因不能为空' })
  reason: string;
}
