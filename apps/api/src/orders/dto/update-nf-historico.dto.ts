import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateNfHistoricoDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  invoiceNumber?: string;

  /** Valor BRL (string decimal ou número). */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  invoiceValue?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pickedQtyAtTime?: number;

  /** Data de saída / registro (YYYY-MM-DD ou ISO datetime). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  createdAt?: string;
}

export class SearchNfHistoricoDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
