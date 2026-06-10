import { Transform } from 'class-transformer';
import { IsOptional } from 'class-validator';

export class ListProductCategoryQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === true || value === 'true',
  )
  includeInactive?: boolean;
}
