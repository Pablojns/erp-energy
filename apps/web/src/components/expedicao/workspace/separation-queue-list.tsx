'use client';

import type { KeyboardEvent, MouseEvent } from 'react';
import { Trash2 } from 'lucide-react';
import {
  displayOrDash,
  formatOrderQueueDate,
  orderDisplayNumber,
} from '@/src/components/expedicao/shared/order-helpers';
import { resolveSeparationWorkflowStep } from '@/src/components/expedicao/shared/separation-workflow';
import { SeparationStepIndicator } from '@/src/components/expedicao/workspace/separation-step-indicator';
import {
  MANUAL_URGENT_BADGE_STYLE,
  URGENT_BADGE_STYLE,
} from '@/src/components/expedicao/shared/pedidos-status-styles';
import type { OrderDto } from '@/src/components/expedicao/shared/types';

function separationProgress(order: OrderDto): { picked: number; total: number } {
  let picked = 0;
  let total = 0;
  for (const item of order.items ?? []) {
    total += item.quantity ?? 0;
    picked += Math.min(item.pickedQty ?? 0, item.quantity ?? 0);
  }
  return { picked, total };
}

/**
 * Fila de separação em lista: uma linha por pedido, com recebedor,
 * transportadora e ponto de descarga sempre visíveis (antes eram blocos
 * em grade, que escondiam justamente esses campos).
 */
export function SeparationQueueList(props: {
  orders: OrderDto[];
  selectedOrderId: string | null;
  selectedIds: Set<string>;
  onSelectOrder: (id: string) => void;
  onOrderChosen?: () => void;
  onToggleSelection: (id: string) => void;
  onRemoveFromSeparation?: (order: OrderDto) => void;
}) {
  const {
    orders,
    selectedOrderId,
    selectedIds,
    onSelectOrder,
    onOrderChosen,
    onToggleSelection,
    onRemoveFromSeparation,
  } = props;

  const openOrder = (id: string) => {
    onSelectOrder(id);
    onOrderChosen?.();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openOrder(id);
    }
  };

  return (
    <div className="exp-sep-list">
      <div className="exp-sep-list-header" role="row">
        <span />
        <span>Pedido</span>
        <span>Recebedor</span>
        <span>Transportadora</span>
        <span>Ponto de descarga</span>
        <span className="text-center">Separação</span>
        <span className="text-center">Data Ped.</span>
        <span className="text-center">Entrega</span>
        <span />
      </div>

      {orders.map((order) => {
        const numero = orderDisplayNumber(order);
        const { picked, total } = separationProgress(order);
        const step = resolveSeparationWorkflowStep(order);
        const urgent = Boolean(order.isUrgentManual) || order.priority <= 2;
        const orderWhen = formatOrderQueueDate(
          order.orderDate ?? order.createdAt,
        );
        const deliveryWhen = order.requestedDeliveryDate
          ? formatOrderQueueDate(order.requestedDeliveryDate)
          : '—';

        return (
          <div
            key={order.id}
            role="button"
            tabIndex={0}
            onClick={() => openOrder(order.id)}
            onKeyDown={(e) => handleKeyDown(e, order.id)}
            className={`exp-sep-list-row${
              selectedOrderId === order.id ? ' exp-sep-list-row--selected' : ''
            }${selectedIds.has(order.id) ? ' exp-sep-list-row--checked' : ''}`}
          >
            <label
              className="exp-sep-list-check"
              onClick={(e: MouseEvent) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                className="pedido-card-checkbox"
                checked={selectedIds.has(order.id)}
                onChange={() => onToggleSelection(order.id)}
                aria-label={`Selecionar pedido ${numero}`}
              />
            </label>

            {/* Badge em segunda linha: lado a lado ele cobria número e recebedor. */}
            <span className="exp-sep-list-num">
              <span className="exp-sep-list-num-value">#{numero}</span>
              {urgent ? (
                <span
                  className="exp-sep-list-urgent"
                  style={
                    order.isUrgentManual
                      ? MANUAL_URGENT_BADGE_STYLE
                      : URGENT_BADGE_STYLE
                  }
                >
                  URGENTE
                </span>
              ) : null}
            </span>

            <span className="exp-sep-list-text" title={order.receiverName ?? ''}>
              {displayOrDash(order.receiverName ?? order.customerName)}
            </span>

            <span className="exp-sep-list-text" title={order.carrierName ?? ''}>
              {displayOrDash(order.carrierName)}
            </span>

            <span
              className="exp-sep-list-text"
              title={order.unloadingPoint ?? ''}
            >
              {displayOrDash(order.unloadingPoint)}
            </span>

            <span className="exp-sep-list-progress">
              <SeparationStepIndicator currentStep={step} compact />
              {total > 0 ? (
                <span className="exp-sep-list-progress-qty">
                  {picked}/{total}
                </span>
              ) : null}
            </span>

            <span className="exp-sep-list-date">{orderWhen}</span>
            <span className="exp-sep-list-date">{deliveryWhen}</span>

            <span className="exp-sep-list-actions">
              {onRemoveFromSeparation ? (
                <button
                  type="button"
                  className="exp-queue-card-admin-icon-btn exp-queue-card-admin-icon-btn--danger"
                  aria-label={`Remover pedido ${numero} da separação`}
                  title="Remover da separação"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFromSeparation(order);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
