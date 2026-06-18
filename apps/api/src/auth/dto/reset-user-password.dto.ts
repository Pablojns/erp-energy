import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetUserPasswordDto {
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password!: string;
}
