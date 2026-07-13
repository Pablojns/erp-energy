import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { USER_DEPARTMENTS } from '../../notifications/notification-routing.constants';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['ADMIN', 'OPERADOR'])
  role?: 'ADMIN' | 'OPERADOR';

  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== '')
  @IsString()
  @IsIn([...USER_DEPARTMENTS])
  department?: string | null;
}
