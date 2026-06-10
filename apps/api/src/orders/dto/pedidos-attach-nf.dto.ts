import {
  IsDateString,
  IsNumberString,
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
  @IsNumberString()
  @MaxLength(9)
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  invoiceValue?: string;

  @IsOptional()
  @IsDateString()
  exitDate?: string;
}

