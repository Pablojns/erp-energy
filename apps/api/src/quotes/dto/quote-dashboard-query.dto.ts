import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';

export const QUOTE_DASHBOARD_PERIODS = ['7d', '30d', '90d', 'all'] as const;
export type QuoteDashboardPeriod = (typeof QUOTE_DASHBOARD_PERIODS)[number];

export class QuoteDashboardQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(QUOTE_DASHBOARD_PERIODS)
  period?: QuoteDashboardPeriod;
}
