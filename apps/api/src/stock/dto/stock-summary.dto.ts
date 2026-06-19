import { IsOptional, IsString, MaxLength } from 'class-validator';

export class StockSummaryQueryDto {
  /** Data inicial inclusiva (YYYY-MM-DD). */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  startDate?: string;

  /** Data final inclusiva (YYYY-MM-DD). */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  endDate?: string;
}
