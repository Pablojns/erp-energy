import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateVendaExternaItemDto {
  @IsString()
  @IsNotEmpty({ message: 'Informe a descrição do item.' })
  @MaxLength(500)
  description!: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsUUID('4')
  productId?: string | null;

  @IsOptional()
  @IsUUID('4')
  externalItemId?: string | null;
}
