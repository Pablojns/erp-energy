import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

const STATUS_ITEM = ['pendente', 'completo', 'parcial', 'cancelado'] as const;
export type StatusItemValue = (typeof STATUS_ITEM)[number];

export class PedidosUpdateItemDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantidade_separada?: number;

  @IsOptional()
  @IsIn([...STATUS_ITEM])
  status_item?: StatusItemValue;
}

