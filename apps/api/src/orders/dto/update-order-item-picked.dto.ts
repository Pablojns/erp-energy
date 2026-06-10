import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class UpdateOrderItemPickedDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pickedQty!: number;
}
