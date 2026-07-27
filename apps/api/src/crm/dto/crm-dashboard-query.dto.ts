import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { CRM_CARD_ORIGINS } from './create-crm-card.dto';

/** Períodos suportados pelo dashboard CRM completo. */
export const CRM_DASHBOARD_PERIODS = [
  'hoje',
  '7d',
  '30d',
  '90d',
  'month',
  'prev_month',
  'quarter',
  'year',
  'custom',
  'all',
] as const;
export type CrmDashboardPeriod = (typeof CRM_DASHBOARD_PERIODS)[number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CrmDashboardQueryDto {
  @IsOptional()
  @IsString()
  @IsIn([...CRM_CARD_ORIGINS, 'TODOS'])
  origin?: string;

  @IsOptional()
  @IsString()
  @IsIn([...CRM_DASHBOARD_PERIODS])
  period?: CrmDashboardPeriod;

  /** Início do intervalo (YYYY-MM-DD) — usado com period=custom ou como override. */
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: 'startDate deve ser YYYY-MM-DD' })
  startDate?: string;

  /** Fim do intervalo (YYYY-MM-DD). */
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: 'endDate deve ser YYYY-MM-DD' })
  endDate?: string;
}
