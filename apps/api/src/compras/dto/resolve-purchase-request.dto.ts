import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ResolvePurchaseRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  purchaseValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  refusalReason?: string;
}
