import { IsIn } from 'class-validator';

export class SnoozeNotificationDto {
  @IsIn(['1h', '2h', '4h', 'tomorrow'])
  duration!: '1h' | '2h' | '4h' | 'tomorrow';
}
