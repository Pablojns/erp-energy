import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateNfHistoricoDto {
  @IsString()
  @MaxLength(64)
  invoiceNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  invoiceValue?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pickedQtyAtTime?: number;

  /** Data de saída (YYYY-MM-DD ou ISO). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  createdAt?: string;
}
