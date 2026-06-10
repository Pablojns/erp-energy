import { Type } from 'class-transformer';
import { IsUUID, IsInt, IsPositive, Min, IsOptional } from 'class-validator';

export class CreateOrderItemDto {
  @IsUUID('4')
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Min(1)
  quantity!: number;

  /** Se omitido, usa o preço cadastral atual do produto. */
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  unitPrice?: number;
}
