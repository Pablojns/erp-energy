import { IsIn, IsString } from 'class-validator';
import { QUOTE_STATUSES, type QuoteStatus } from './create-quote.dto';

export class UpdateQuoteStatusDto {
  @IsString()
  @IsIn(QUOTE_STATUSES)
  status!: QuoteStatus;
}
