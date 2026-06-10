'use client';

import {
  formatOrderQueueTime,
  getOrderSendState,
  getQueueCardVisual,
  orderDisplayNumber,
} from '@/src/components/expedicao/shared/order-helpers';
import type { OrderDto } from '@/src/components/expedicao/shared/types';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function formatCurrency(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return brl.format(Number.isFinite(n) ? n : 0);
}

export function OrderQueueCard(props: {
  order: OrderDto;
  selected: boolean;
  onSelect: () => void;
}) {
  const { order, selected, onSelect } = props;
  const numero = orderDisplayNumber(order);
  const when = formatOrderQueueTime(order.requestedDeliveryDate ?? order.orderDate ?? order.createdAt);
  const visual = getQueueCardVisual(order);
  const Icon = visual.icon;
  const sendState = getOrderSendState(order);
  const statusLabel =
    sendState === 'complete'
      ? 'COMPLETO'
      : sendState === 'partial'
        ? 'PARCIAL'
        : visual.badgeLabel;
  const statusTone =
    sendState === 'complete'
      ? 'finished'
      : sendState === 'partial'
        ? 'partial'
        : visual.badgeTone;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`exp-queue-card ${selected ? 'exp-queue-card--selected' : ''}`}
    >
      <div className="exp-queue-card-head">
        <span className="exp-queue-card-num">#{numero}</span>
        <span className={`exp-queue-card-icon exp-queue-card-icon--${visual.tone}`}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="exp-queue-card-value">{formatCurrency(order.totalValue)}</p>
      <p className="exp-queue-card-date">{when}</p>
      <span
        className={`exp-queue-status-badge exp-queue-status-badge--${statusTone}`}
      >
        {statusLabel}
      </span>
    </button>
  );
}
