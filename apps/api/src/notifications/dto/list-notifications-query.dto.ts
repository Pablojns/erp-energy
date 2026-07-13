import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { NOTIFICATION_PRIORITY } from '../notification.constants';

export class ListNotificationsQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  read?: boolean;

  @IsOptional()
  @IsString()
  @IsIn([
    NOTIFICATION_PRIORITY.LOW,
    NOTIFICATION_PRIORITY.NORMAL,
    NOTIFICATION_PRIORITY.HIGH,
    NOTIFICATION_PRIORITY.URGENT,
    'urgent',
  ])
  priority?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
