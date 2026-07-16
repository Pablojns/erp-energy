import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateQuoteItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  catalogProductId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  engraving?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  supplier?: string | null;

  @IsOptional()
  @IsBoolean()
  requiresArtwork?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(260)
  artworkFileName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  artworkMimeType?: string | null;

  @IsOptional()
  @IsString()
  artworkData?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}
