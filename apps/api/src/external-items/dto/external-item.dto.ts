import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateExternalItemDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  lastKnownPrice!: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string;
}

export class UpdateExternalItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  lastKnownPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string;
}

export class ExternalItemStockMoveDto {
  @IsIn(['entrada', 'saida'])
  kind!: 'entrada' | 'saida';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string | null;
}
