import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
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
}
