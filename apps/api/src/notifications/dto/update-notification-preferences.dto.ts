import { IsObject } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsObject()
  preferences!: Record<string, boolean>;
}
