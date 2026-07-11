import { IsIn, IsOptional, IsString } from 'class-validator';
import { CRM_CARD_ORIGINS } from './create-crm-card.dto';

export class CrmDashboardQueryDto {
  @IsOptional()
  @IsString()
  @IsIn([...CRM_CARD_ORIGINS, 'TODOS'])
  origin?: string;
}
