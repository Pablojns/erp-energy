import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/** 1 = mais urgente … 5 = baixa (mesma convenção dos pedidos manuais). */
export class UpdateOrderPriorityDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  priority!: number;
}
