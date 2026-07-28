import type { OrderItemDto } from '@/src/components/expedicao/shared/types';

export type StockAvailabilityTone = 'ok' | 'partial' | 'none' | 'unknown';

export function getStockAvailabilityTone(
  orderedQty: number,
  available: number | null,
): StockAvailabilityTone {
  if (available === null || !Number.isFinite(available)) return 'unknown';
  if (available <= 0) return 'none';
  if (available >= orderedQty) return 'ok';
  return 'partial';
}

export function resolveInitialItemAvailable(item: OrderItemDto): number | null {
  if (item.availableQty !== null && item.availableQty !== undefined) {
    return item.availableQty;
  }
  if (
    item.product?.availableQty !== undefined &&
    item.product.availableQty !== null
  ) {
    return item.product.availableQty;
  }
  if (item.stockAvailable !== null && item.stockAvailable !== undefined) {
    return item.stockAvailable;
  }
  if (
    item.stockQtyOnHand !== null &&
    item.stockQtyOnHand !== undefined &&
    item.reservedQtyProduct !== null &&
    item.reservedQtyProduct !== undefined
  ) {
    return item.stockQtyOnHand - item.reservedQtyProduct;
  }
  if (
    item.product &&
    typeof item.product.stockQty === 'number' &&
    Number.isFinite(item.product.stockQty)
  ) {
    return item.product.stockQty - (item.product.reservedQty ?? 0);
  }
  return null;
}
