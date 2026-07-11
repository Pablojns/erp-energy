import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { CRM_CARD_ORIGINS } from './create-crm-card.dto';

export class CrmRelatoriosQueryDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  @IsIn([...CRM_CARD_ORIGINS, 'TODOS'])
  origin?: string;
}
