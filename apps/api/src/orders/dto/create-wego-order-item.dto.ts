import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateWegOrderItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  lineNumber!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sku!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  description!: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  ncm?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;
}
