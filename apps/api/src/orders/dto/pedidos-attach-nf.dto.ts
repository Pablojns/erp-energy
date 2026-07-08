import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class PedidosAttachNfDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nota_fiscal?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? undefined
      : String(value).trim(),
  )
  @IsString()
  @MaxLength(64)
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  invoiceValue?: string;

  @IsOptional()
  @IsDateString()
  exitDate?: string;
}

