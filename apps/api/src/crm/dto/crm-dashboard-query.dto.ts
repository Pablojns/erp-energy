import { IsIn, IsOptional, IsString } from 'class-validator';
import { CRM_CARD_ORIGINS } from './create-crm-card.dto';

export const CRM_DASHBOARD_PERIODS = ['7d', '30d', '90d', 'all'] as const;
export type CrmDashboardPeriod = (typeof CRM_DASHBOARD_PERIODS)[number];

export class CrmDashboardQueryDto {
  @IsOptional()
  @IsString()
  @IsIn([...CRM_CARD_ORIGINS, 'TODOS'])
  origin?: string;

  @IsOptional()
  @IsString()
  @IsIn([...CRM_DASHBOARD_PERIODS])
  period?: CrmDashboardPeriod;
}
