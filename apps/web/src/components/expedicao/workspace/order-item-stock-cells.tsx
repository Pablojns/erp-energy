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

function StockPlaceholder(props: { loading: boolean }) {
  if (props.loading) {
    return (
      <span className="exp-wb-cell-muted text-xs" aria-label="Carregando estoque">
        …
      </span>
    );
  }
  return <span className="exp-wb-cell-muted text-xs">—</span>;
}

export function OrderItemOrderedQtyCell(props: { qty: number }) {
  return <span className="exp-wb-cell-num text-xs">{props.qty}</span>;
}

export function OrderItemStockOnHandCell(props: { stock: OrderItemStockState }) {
  const { stock } = props;
  if (stock.loading || stock.onHand === null) {
    return <StockPlaceholder loading={stock.loading} />;
  }
  return (
    <span className="exp-wb-cell-num text-xs font-semibold tabular-nums" title="Estoque físico total">
      {stock.onHand}
    </span>
  );
}

export function OrderItemStockReservedCell(props: { stock: OrderItemStockState }) {
  const { stock } = props;
  if (stock.loading || stock.reserved === null) {
    return <StockPlaceholder loading={stock.loading} />;
  }
  return (
    <span
      className="exp-wb-cell-num text-xs font-semibold tabular-nums"
      title="Reservado em todos os pedidos (reservas ativas do produto)"
    >
      {stock.reserved}
    </span>
  );
}

export function OrderItemStockAvailableCell(props: {
  stock: OrderItemStockState;
  orderedQty: number;
}) {
  const { stock, orderedQty } = props;
  if (stock.loading || stock.available === null) {
    return <StockPlaceholder loading={stock.loading} />;
  }
  const tone = getStockAvailabilityTone(orderedQty, stock.available);
  const isLow = stock.available < orderedQty;
  return (
    <span
      className={`exp-wb-stock-qty-badge text-[12px] font-semibold tabular-nums ${stockQtyToneClass(tone)}${isLow ? ' exp-wb-stock-qty-badge--low' : ''}`}
      title="Estoque disponível para este pedido (físico menos o já comprometido)"
    >
      {stock.available}
    </span>
  );
}

/** Quatro números: pedido | real | reservado | disponível — para cards compactos. */
export function OrderItemStockFiguresInline(props: {
  orderedQty: number;
  stock: OrderItemStockState;
}) {
  return (
    <span className="exp-wb-stock-triple" aria-label="Quantidade do pedido, estoque real, reservado e disponível">
      <span className="exp-wb-stock-triple-item">
        <span className="exp-wb-stock-triple-label">Pedido</span>
        <OrderItemOrderedQtyCell qty={props.orderedQty} />
      </span>
      <span className="exp-wb-stock-triple-item">
        <span className="exp-wb-stock-triple-label">Real</span>
        <OrderItemStockOnHandCell stock={props.stock} />
      </span>
      <span className="exp-wb-stock-triple-item">
        <span className="exp-wb-stock-triple-label">Reservado</span>
        <OrderItemStockReservedCell stock={props.stock} />
      </span>
      <span className="exp-wb-stock-triple-item">
        <span className="exp-wb-stock-triple-label">Disponível</span>
        <OrderItemStockAvailableCell orderedQty={props.orderedQty} stock={props.stock} />
      </span>
    </span>
  );
}
