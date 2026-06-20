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

export function stockAvailabilityLabel(tone: StockAvailabilityTone): string {
  switch (tone) {
    case 'ok':
      return 'Suficiente';
    case 'partial':
      return 'Parcial';
    case 'none':
      return 'Sem estoque';
    default:
      return 'Indisponível';
  }
}

export function stockAvailabilityBadgeClass(tone: StockAvailabilityTone): string {
  switch (tone) {
    case 'ok':
      return 'exp-item-badge--ok';
    case 'partial':
      return 'exp-item-badge--warn';
    case 'none':
      return 'exp-item-badge--late';
    default:
      return 'exp-item-badge--pending';
  }
}

export function resolveInitialItemAvailable(item: OrderItemDto): number | null {
  if (item.availableQty !== null && item.availableQty !== undefined) {
    return item.availableQty;
  }
  if (item.product?.availableQty !== undefined) {
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
  return null;
}
