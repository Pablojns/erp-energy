'use client';

import type { KeyboardEvent, MouseEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import {
  formatOrderQueueTime,
  getOrderQueueCardStatusBadge,
  orderDisplayNumber,
} from '@/src/components/expedicao/shared/order-helpers';
import {
  orderWorkflowCardBadgeStyle,
  URGENT_BADGE_STYLE,
} from '@/src/components/expedicao/shared/pedidos-status-styles';
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
  checkedForPrint?: boolean;
  onTogglePrint?: () => void;
  checkedForRemoval?: boolean;
  onToggleRemoval?: () => void;
  showAdminActions?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const {
    order,
    selected,
    onSelect,
    checkedForPrint = false,
    onTogglePrint,
    checkedForRemoval = false,
    onToggleRemoval,
    showAdminActions = false,
    onEdit,
    onDelete,
  } = props;
  const numero = orderDisplayNumber(order);
  const when = formatOrderQueueTime(
    order.requestedDeliveryDate ?? order.orderDate ?? order.createdAt,
  );
  const statusBadge = getOrderQueueCardStatusBadge(order);
  const isUrgent = order.priority <= 2;
  const isMarked =
    (onTogglePrint && checkedForPrint) || (onToggleRemoval && checkedForRemoval);

  const handleCardKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      className={`exp-queue-card-wrap ${isMarked ? 'exp-queue-card-wrap--print' : ''} ${selected ? 'exp-queue-card-wrap--selected' : ''}`}
    >
      <div className="exp-queue-card-body">
        <div
          role="button"
          tabIndex={0}
          onClick={onSelect}
          onKeyDown={handleCardKeyDown}
          className={`exp-queue-card ${selected ? 'exp-queue-card--selected' : ''}`}
        >
          <div className="exp-queue-card-head">
            <div className="exp-queue-card-head-left">
              {onTogglePrint ? (
                <label
                  className="exp-queue-card-check"
                  onClick={(e: MouseEvent) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={checkedForPrint}
                    onChange={() => onTogglePrint()}
                    aria-label={`Selecionar pedido ${numero} para PDF`}
                  />
                </label>
              ) : null}
              {onToggleRemoval ? (
                <label
                  className="exp-queue-card-check"
                  onClick={(e: MouseEvent) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={checkedForRemoval}
                    onChange={() => onToggleRemoval()}
                    aria-label={`Selecionar pedido ${numero} para remover da separação`}
                  />
                </label>
              ) : null}
              <span className="exp-queue-card-num">#{numero}</span>
              {isUrgent ? (
                <span
                  className="exp-queue-urgent-badge exp-queue-urgent-badge--pulse"
                  style={URGENT_BADGE_STYLE}
                >
                  URGENTE
                </span>
              ) : null}
            </div>
          </div>
          <p className="exp-queue-card-value">{formatCurrency(order.totalValue)}</p>
          <p className="exp-queue-card-date">{when}</p>
          <span className="exp-queue-status-badge" style={orderWorkflowCardBadgeStyle(statusBadge.color)}>
            {statusBadge.label}
          </span>
        </div>
        {showAdminActions ? (
          <div className="exp-queue-card-admin-actions">
            {onEdit ? (
              <button
                type="button"
                className="exp-queue-card-admin-icon-btn"
                aria-label={`Editar pedido ${numero}`}
                title="Editar pedido"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className="exp-queue-card-admin-icon-btn exp-queue-card-admin-icon-btn--danger"
                aria-label={`Excluir pedido ${numero}`}
                title="Excluir pedido"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
