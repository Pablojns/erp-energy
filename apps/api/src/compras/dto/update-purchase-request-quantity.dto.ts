import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdatePurchaseRequestQuantityDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  suggestedQty?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;
}
