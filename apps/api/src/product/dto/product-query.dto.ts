import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

const SORT_FIELDS = [
  'name',
  'internalCode',
  'sku',
  'createdAt',
  'updatedAt',
  'stockQty',
  'price',
  'minStock',
  'category',
] as const;

export class ProductQueryDto {
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

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status?: 'active' | 'inactive' | 'all';

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === true || value === 'true',
  )
  @IsBoolean()
  lowStock?: boolean;

  @IsOptional()
  @IsString()
  @IsIn([...SORT_FIELDS])
  sortBy?: string;

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
