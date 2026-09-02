import type { OrderItemDto } from '@/src/components/expedicao/shared/types';

export type StockAvailabilityTone = 'ok' | 'partial' | 'none' | 'unknown';

export type ItemStockFigures = {
  onHand: number | null;
  reserved: number | null;
  available: number | null;
};

export function getStockAvailabilityTone(
  orderedQty: number,
  available: number | null,
): StockAvailabilityTone {
  if (available === null || !Number.isFinite(available)) return 'unknown';
  if (available <= 0) return 'none';
  if (available >= orderedQty) return 'ok';
  return 'partial';
}

/** Estoque físico (Product.stockQty), sem descontar reserva. */
export function resolveItemOnHand(item: OrderItemDto): number | null {
  if (item.stockQtyOnHand !== null && item.stockQtyOnHand !== undefined) {
    return item.stockQtyOnHand;
  }
  if (item.product && typeof item.product.stockQty === 'number') {
    return item.product.stockQty;
  }
  return null;
}

/**
 * Quanto ainda sobra para atender pedidos: stockQty - reservedQty.
 * Igual ao Estoque (`availableQty`) e à Separação em Lote. Nunca negativo na tela.
 */
export function availableFromPhysical(
  stockQty: number | null | undefined,
  reservedQty: number | null | undefined,
  availableQty?: number | null,
): number | null {
  if (availableQty !== null && availableQty !== undefined && Number.isFinite(availableQty)) {
    return Math.max(0, availableQty);
  }
  if (stockQty === null || stockQty === undefined || !Number.isFinite(stockQty)) {
    return null;
  }
  return Math.max(0, stockQty - (reservedQty ?? 0));
}

export function resolveInitialItemStockFigures(item: OrderItemDto): ItemStockFigures {
  const onHand = resolveItemOnHand(item);
  const reserved = item.reservedQtyProduct ?? item.product?.reservedQty ?? null;
  const hinted =
    item.availableQty ?? item.product?.availableQty ?? item.stockAvailable ?? null;
  const available =
    onHand !== null
      ? availableFromPhysical(onHand, reserved ?? 0)
      : availableFromPhysical(null, null, hinted);
  return { onHand, reserved, available };
}

export function resolveInitialItemAvailable(item: OrderItemDto): number | null {
  return resolveInitialItemStockFigures(item).available;
}
