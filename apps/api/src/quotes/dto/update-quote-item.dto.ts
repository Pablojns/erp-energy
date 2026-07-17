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

export class UpdateQuoteItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  engraving?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  engravingTechniqueId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  engravingPrice?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  productPrice?: number | null;

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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}
