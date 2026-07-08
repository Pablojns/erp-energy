import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Min, ValidateIf } from 'class-validator';

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

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  engravingPrice?: number | null;
}
