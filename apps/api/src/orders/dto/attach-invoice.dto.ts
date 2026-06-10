import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AttachInvoiceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  invoiceNumber!: string;
}
