'use client';

import { getStockAvailabilityTone } from '@/src/components/expedicao/shared/item-stock-availability';
import type { OrderItemStockState } from '@/src/components/expedicao/shared/use-order-items-stock';

function stockQtyToneClass(tone: ReturnType<typeof getStockAvailabilityTone>): string {
  switch (tone) {
    case 'ok':
      return 'exp-wb-stock-qty--ok';
    case 'partial':
      return 'exp-wb-stock-qty--partial';
    case 'none':
      return 'exp-wb-stock-qty--none';
    default:
      return '';
  }
}

export function OrderItemOrderedQtyCell(props: { qty: number }) {
  return <span className="exp-wb-cell-num">{props.qty}</span>;
}

export function OrderItemStockQtyCell(props: {
  stock: OrderItemStockState;
  orderedQty: number;
}) {
  const { stock, orderedQty } = props;
  if (stock.loading) {
    return (
      <span className="exp-wb-cell-muted" aria-label="Carregando estoque">
        …
      </span>
    );
  }
  if (stock.available === null) {
    return <span className="exp-wb-cell-muted">—</span>;
  }
  const tone = getStockAvailabilityTone(orderedQty, stock.available);
  return (
    <span className={`exp-wb-cell-num font-semibold ${stockQtyToneClass(tone)}`}>
      {stock.available}
    </span>
  );
}
