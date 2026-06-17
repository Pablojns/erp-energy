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

export function mapPrismaToMovementKind(
  type: StockMovementType,
): MovementKind | undefined {
  const map: Partial<Record<StockMovementType, MovementKind>> = {
    [StockMovementType.INBOUND]: 'entrada',
    [StockMovementType.OUTBOUND]: 'saida',
    [StockMovementType.ADJUSTMENT]: 'ajuste',
    [StockMovementType.RESERVE]: 'reserva',
    [StockMovementType.RESERVE_CANCEL]: 'cancelamento_reserva',
  };
  return map[type];
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

  @IsOptional()
  @IsString()
  @IsIn(MOVEMENT_KIND_VALUES, {
    message:
      'movementKind deve ser: entrada | saida | ajuste | reserva | cancelamento_reserva',
  })
  movementKind?: MovementKind;

  /** Alternativa ao movementKind, no formato do enum Prisma (ex.: INBOUND). */
  @IsOptional()
  @IsEnum(StockMovementType, {
    message: 'movementType inválido (ex.: INBOUND, OUTBOUND, ADJUSTMENT).',
  })
  movementType?: StockMovementType;

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
