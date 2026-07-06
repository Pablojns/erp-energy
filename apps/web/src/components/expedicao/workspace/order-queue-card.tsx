'use client';

import type { KeyboardEvent, MouseEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import {
  displayOrDash,
  formatOrderQueueDate,
  getOrderQueueCardStatusBadge,
  orderDisplayNumber,
} from '@/src/components/expedicao/shared/order-helpers';
import {
  orderWorkflowCardBadgeStyle,
  MANUAL_URGENT_BADGE_STYLE,
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
  const comprador = displayOrDash(order.deliveryCnpj ?? order.customerDocument);
  const when = formatOrderQueueDate(order.orderDate ?? order.createdAt);
  const statusBadge = getOrderQueueCardStatusBadge(order);
  const isPriorityUrgent = order.priority <= 2;
  const isManualUrgent = Boolean(order.isUrgentManual);
  const isMarked =
    (onTogglePrint && checkedForPrint) || (onToggleRemoval && checkedForRemoval);
  const showNfPendente =
    order.status === 'FINALIZADO' &&
    Boolean(order.notaRemessa?.trim()) &&
    !order.invoiceNumber?.trim();

  const handleCardKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      className={`exp-queue-card-wrap w-full min-w-0 ${isMarked ? 'exp-queue-card-wrap--print' : ''} ${selected ? 'exp-queue-card-wrap--selected' : ''}`}
    >
      <div className="exp-queue-card-body w-full min-w-0">
        <div
          role="button"
          tabIndex={0}
          onClick={onSelect}
          onKeyDown={handleCardKeyDown}
          className={`exp-queue-card flex min-h-0 flex-col gap-1 !p-2 ${selected ? 'exp-queue-card--selected' : ''}`}
        >
          <div className="exp-queue-card-head gap-1.5">
            <div className="exp-queue-card-head-left gap-1.5">
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
              <div className="exp-queue-card-title-block gap-1">
                <span className="exp-queue-card-num text-sm">#{numero}</span>
                <span
                  className="exp-queue-card-customer text-xs"
                  title={`Comprador: ${comprador}`}
                >
                  {comprador}
                </span>
              </div>
              {order.source === 'SITE' ? (
                <span className="exp-queue-source-badge exp-queue-source-badge--site text-xs">
                  SITE
                </span>
              ) : order.source === 'VENDA_EXTERNA' ? (
                <span className="exp-queue-source-badge exp-queue-source-badge--venda-externa text-xs">
                  VENDA EXTERNA
                </span>
              ) : (
                <span className="exp-queue-source-badge exp-queue-source-badge--weg text-xs">
                  WEG
                </span>
              )}
              {isManualUrgent ? (
                <span
                  className="exp-queue-urgent-badge text-xs"
                  style={MANUAL_URGENT_BADGE_STYLE}
                >
                  URGENTE
                </span>
              ) : isPriorityUrgent ? (
                <span
                  className="exp-queue-urgent-badge exp-queue-urgent-badge--pulse text-xs"
                  style={URGENT_BADGE_STYLE}
                >
                  URGENTE
                </span>
              ) : null}
              {showNfPendente ? (
                <span className="exp-queue-nf-pendente-badge text-xs">NF PENDENTE</span>
              ) : null}
            </div>
          </div>
          {order.linkedOrderId ? (
            <p className="text-[10px] font-medium text-orange-400">
              Vinculado ao pedido #{order.linkedOrderDisplayNumber ?? '—'}
            </p>
          ) : null}
          <p className="exp-queue-card-value text-xs font-bold">{formatCurrency(order.totalValue)}</p>
          <p className="exp-queue-card-date text-xs">{when}</p>
          <span
            className="exp-queue-status-badge text-xs"
            style={orderWorkflowCardBadgeStyle(statusBadge.color)}
          >
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
