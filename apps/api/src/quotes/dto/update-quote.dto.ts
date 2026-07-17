import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  QUOTE_CUSTOMER_TYPES,
  QUOTE_ORIGINS,
  QUOTE_STATUSES,
  type QuoteStatus,
} from './create-quote.dto';

export class UpdateQuoteDto {
  @IsOptional()
  @IsDateString()
  requestDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerOrderRef?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  billingCompany?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(QUOTE_STATUSES)
  status?: QuoteStatus;

  @IsOptional()
  @IsString()
  @IsIn(QUOTE_CUSTOMER_TYPES)
  customerType?: (typeof QUOTE_CUSTOMER_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  customerId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  customerDocument?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  responsibleUserId?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(QUOTE_ORIGINS)
  origin?: (typeof QUOTE_ORIGINS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  observations?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  customerNotes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  carrierId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  deliveryAddress?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  freightValue?: number | null;

  @IsOptional()
  @IsBoolean()
  freightToConsult?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deliveryDeadline?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  freightType?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentTerms?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentMethod?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  linkedCrmCardId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  linkedOrderId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  commissionPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  marginReservePercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salesMarginPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  difalValue?: number | null;

  @IsOptional()
  @IsBoolean()
  difalIsPercent?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  otherExtraCosts?: number | null;
}
