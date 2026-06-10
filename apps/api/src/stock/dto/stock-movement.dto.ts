import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { StockMovementType } from '@erp/database';

export const MOVEMENT_KIND_VALUES = [
  'entrada',
  'saida',
  'ajuste',
  'reserva',
  'cancelamento_reserva',
] as const;

export type MovementKind = (typeof MOVEMENT_KIND_VALUES)[number];

export function mapMovementKindToPrisma(kind: MovementKind): StockMovementType {
  const map: Record<MovementKind, StockMovementType> = {
    entrada: StockMovementType.INBOUND,
    saida: StockMovementType.OUTBOUND,
    ajuste: StockMovementType.ADJUSTMENT,
    reserva: StockMovementType.RESERVE,
    cancelamento_reserva: StockMovementType.RESERVE_CANCEL,
  };
  return map[kind];
}

export class StockMovementQueryDto {
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
  @IsUUID('4')
  productId?: string;

  @IsOptional()
  @IsEnum(StockMovementType)
  movementType?: StockMovementType;
}

/**
 * Payload de criação (POST /stock/movements): tipos legíveis para operação brasileira.
 */
export class CreateStockMovementDto {
  @IsUUID('4', { message: 'Informe um produto válido.' })
  productId!: string;

  @IsString()
  @IsIn(MOVEMENT_KIND_VALUES, {
    message:
      'movementKind deve ser: entrada | saida | ajuste | reserva | cancelamento_reserva',
  })
  movementKind!: MovementKind;

  @Type(() => Number)
  @IsInt({ message: 'Quantidade deve ser um número inteiro.' })
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @Type(() => Date)
  movementDate?: Date;
}
