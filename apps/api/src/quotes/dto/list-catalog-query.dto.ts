import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export const CATALOG_SORT_BY = [
  'price',
  'name',
  'stock',
  'lastUpdate',
] as const;

export type CatalogSortBy = (typeof CATALOG_SORT_BY)[number];

export const CATALOG_SORT_ORDER = ['asc', 'desc'] as const;

export type CatalogSortOrder = (typeof CATALOG_SORT_ORDER)[number];

export class ListCatalogQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  /** Quando false, pula count() e retorna apenas hasMore (scroll infinito). */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  includeTotal?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(CATALOG_SORT_BY)
  sortBy?: CatalogSortBy;

  @IsOptional()
  @IsString()
  @IsIn(CATALOG_SORT_ORDER)
  sortOrder?: CatalogSortOrder;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsString()
  supplier?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  inStockOnly?: boolean;
}
