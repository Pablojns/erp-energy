'use client';

import type { KeyboardEvent, MouseEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import {
  displayOrDash,
  formatOrderQueueDate,
  getOrderQueueCardStatusBadge,
  orderDisplayNumber,
} from '@/src/components/expedicao/shared/order-helpers';
import { resolveSeparationWorkflowStep } from '@/src/components/expedicao/shared/separation-workflow';
import { SeparationStepIndicator } from '@/src/components/expedicao/workspace/separation-step-indicator';
import {
  orderWorkflowCardBadgeStyle,
  MANUAL_URGENT_BADGE_STYLE,
  URGENT_BADGE_STYLE,
} from '@/src/components/expedicao/shared/pedidos-status-styles';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import { useCardSwipe } from '@/src/hooks/use-card-swipe';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function formatCurrency(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return brl.format(Number.isFinite(n) ? n : 0);
}

const SWIPE_SECTIONS = 2;

export function OrderQueueCard(props: {
  order: OrderDto;
  selected: boolean;
  onSelect: () => void;
  checkedForPrint?: boolean;
  onTogglePrint?: () => void;
  checkedForSeparation?: boolean;
  onToggleSeparation?: () => void;
  showSeparationProgress?: boolean;
  onRemoveFromSeparation?: () => void;
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
    checkedForSeparation = false,
    onToggleSeparation,
    showSeparationProgress = false,
    onRemoveFromSeparation,
    showAdminActions = false,
    onEdit,
    onDelete,
  } = props;
  const numero = orderDisplayNumber(order);
  const comprador = displayOrDash(order.deliveryCnpj ?? order.customerDocument);
  const when = formatOrderQueueDate(order.orderDate ?? order.createdAt);
  const deliveryWhen = formatOrderQueueDate(
    order.requestedDeliveryDate ?? order.orderDate ?? order.createdAt,
  );
  const statusBadge = getOrderQueueCardStatusBadge(order);
  const separationStep = resolveSeparationWorkflowStep(order);
  const isPriorityUrgent = order.priority <= 2;
  const isManualUrgent = Boolean(order.isUrgentManual);
  const isMarked =
    (onTogglePrint && checkedForPrint) ||
    (onToggleSeparation && checkedForSeparation);
  const showNfPendente =
    order.status === 'FINALIZADO' &&
    Boolean(order.notaRemessa?.trim()) &&
    !order.invoiceNumber?.trim();

  const swipe = useCardSwipe({
    sectionCount: SWIPE_SECTIONS,
    tapThreshold: 10,
    onTap: onSelect,
  });

  const handleCardKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };

  const sourceBadge =
    order.source === 'SITE' ? (
      <span className="exp-queue-source-badge exp-queue-source-badge--site text-xs">SITE</span>
    ) : order.source === 'VENDA_EXTERNA' ? (
      <span className="exp-queue-source-badge exp-queue-source-badge--venda-externa text-xs">
        VENDA EXTERNA
      </span>
    ) : (
      <span className="exp-queue-source-badge exp-queue-source-badge--weg text-xs">WEG</span>
    );

  const urgentBadge = isManualUrgent ? (
    <span className="exp-queue-urgent-badge text-xs" style={MANUAL_URGENT_BADGE_STYLE}>
      URGENTE
    </span>
  ) : isPriorityUrgent ? (
    <span
      className="exp-queue-urgent-badge exp-queue-urgent-badge--pulse text-xs"
      style={URGENT_BADGE_STYLE}
    >
      URGENTE
    </span>
  ) : null;

  const selectionChecks = (
    <>
      {onTogglePrint ? (
        <label
          className="exp-queue-card-check"
          onClick={(e: MouseEvent) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            className="pedido-card-checkbox"
            checked={checkedForPrint}
            onChange={() => onTogglePrint()}
            aria-label={`Selecionar pedido ${numero} para PDF`}
          />
        </label>
      ) : null}
      {onToggleSeparation ? (
        <label
          className="exp-queue-card-check"
          onClick={(e: MouseEvent) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            className="pedido-card-checkbox"
            checked={checkedForSeparation}
            onChange={() => onToggleSeparation()}
            aria-label={`Selecionar pedido ${numero}`}
          />
        </label>
      ) : null}
    </>
  );

  const adminActionsInner = (
    <>
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
    </>
  );

  const cardTrailingActions =
    onRemoveFromSeparation || showAdminActions ? (
      <div className="exp-queue-card-admin-actions">
        {onRemoveFromSeparation ? (
          <button
            type="button"
            className="exp-queue-card-admin-icon-btn exp-queue-card-admin-icon-btn--danger"
            aria-label={`Remover pedido ${numero} da separação`}
            title="Remover da separação"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveFromSeparation();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {showAdminActions ? adminActionsInner : null}
      </div>
    ) : null;

  const progressNode = showSeparationProgress ? (
    <SeparationStepIndicator currentStep={separationStep} />
  ) : (
    <span
      className="exp-queue-status-badge text-xs"
      style={orderWorkflowCardBadgeStyle(statusBadge.color)}
    >
      {statusBadge.label}
    </span>
  );

  return (
    <div
      className={`exp-queue-card-wrap w-full min-w-0 ${isMarked ? 'exp-queue-card-wrap--print' : ''} ${selected ? 'exp-queue-card-wrap--selected' : ''}`}
    >
      {/* Desktop / tablet ≥768px — layout clássico */}
      <div className="exp-queue-card-body exp-queue-card-body--desktop w-full min-w-0">
        <div
          role="button"
          tabIndex={0}
          onClick={onSelect}
          onKeyDown={handleCardKeyDown}
          className={`exp-queue-card flex min-h-0 flex-col gap-1 !p-2 active:scale-[0.98] ${selected ? 'exp-queue-card--selected' : ''}`}
        >
          <div className="exp-queue-card-head gap-1.5">
            <div className="exp-queue-card-head-left gap-1.5">
              {selectionChecks}
              <div className="exp-queue-card-title-block gap-1">
                <span className="exp-queue-card-num text-sm">#{numero}</span>
                <span
                  className="exp-queue-card-customer text-xs"
                  title={`Comprador: ${comprador}`}
                >
                  {comprador}
                </span>
              </div>
              {sourceBadge}
              {urgentBadge}
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
          {progressNode}
        </div>
        {cardTrailingActions ?? (showAdminActions ? (
          <div className="exp-queue-card-admin-actions">{adminActionsInner}</div>
        ) : null)}
      </div>

      {/* Mobile &lt;768px — linha única 44px com swipe revelando recebedor/data/ações */}
      <div className="exp-queue-card-body exp-queue-card-body--swipe w-full min-w-0">
        <div
          ref={swipe.setViewportRef}
          className="exp-queue-row-viewport"
          role="button"
          tabIndex={0}
          onKeyDown={handleCardKeyDown}
          {...swipe.handlers}
        >
          <div className="exp-queue-row-track" style={swipe.trackStyle}>
            <section className="exp-queue-row-section exp-queue-row-front">
              {onTogglePrint || onToggleSeparation ? (
                <span onClick={(e) => e.stopPropagation()}>{selectionChecks}</span>
              ) : null}
              <span className="exp-queue-row-num">#{numero}</span>
              {showSeparationProgress ? (
                <SeparationStepIndicator currentStep={separationStep} compact />
              ) : (
                <span
                  className="exp-queue-status-badge exp-queue-row-badge"
                  style={orderWorkflowCardBadgeStyle(statusBadge.color)}
                >
                  {statusBadge.label}
                </span>
              )}
              <span className="exp-queue-row-value">{formatCurrency(order.totalValue)}</span>
            </section>
            <section className="exp-queue-row-section exp-queue-row-back">
              <span className="exp-queue-row-receiver truncate">
                {displayOrDash(order.receiverName ?? order.customerName)}
              </span>
              <span className="exp-queue-row-date shrink-0">{deliveryWhen}</span>
              {cardTrailingActions ?? (showAdminActions ? (
                <div className="exp-queue-card-admin-actions">{adminActionsInner}</div>
              ) : null)}
            </section>
          </div>
        </div>
        <div className="exp-queue-row-dots" role="tablist" aria-label="Detalhes do pedido">
          {Array.from({ length: SWIPE_SECTIONS }).map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={swipe.index === i}
              aria-label={i === 0 ? 'Resumo do pedido' : 'Recebedor e ações'}
              className={`exp-queue-swipe-dot${swipe.index === i ? ' exp-queue-swipe-dot--active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                swipe.goTo(i);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
