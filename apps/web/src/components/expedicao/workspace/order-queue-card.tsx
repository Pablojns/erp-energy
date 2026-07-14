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
import { useCardSwipe } from '@/src/hooks/use-card-swipe';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function formatCurrency(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return brl.format(Number.isFinite(n) ? n : 0);
}

const SWIPE_SECTIONS = 4;

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
  const deliveryWhen = formatOrderQueueDate(
    order.requestedDeliveryDate ?? order.orderDate ?? order.createdAt,
  );
  const statusBadge = getOrderQueueCardStatusBadge(order);
  const isPriorityUrgent = order.priority <= 2;
  const isManualUrgent = Boolean(order.isUrgentManual);
  const isMarked =
    (onTogglePrint && checkedForPrint) || (onToggleRemoval && checkedForRemoval);
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
    </>
  );

  const adminActions = showAdminActions ? (
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
  ) : null;

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
          <span
            className="exp-queue-status-badge text-xs"
            style={orderWorkflowCardBadgeStyle(statusBadge.color)}
          >
            {statusBadge.label}
          </span>
        </div>
        {adminActions}
      </div>

      {/* Mobile &lt;768px — swipe horizontal com 4 seções */}
      <div className="exp-queue-card-body exp-queue-card-body--swipe w-full min-w-0">
        <div className="exp-queue-swipe-card">
          {onTogglePrint || onToggleRemoval ? (
            <div className="exp-queue-swipe-card-checks" onClick={(e) => e.stopPropagation()}>
              {selectionChecks}
            </div>
          ) : null}
          <div
            ref={swipe.setViewportRef}
            className="exp-queue-swipe-viewport"
            {...swipe.handlers}
          >
            <div className="exp-queue-swipe-track" style={swipe.trackStyle}>
              <section className="exp-queue-swipe-section">
                <div className="exp-queue-swipe-section-inner">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="exp-queue-card-num text-sm">#{numero}</span>
                    {sourceBadge}
                    {urgentBadge}
                  </div>
                  <span
                    className="exp-queue-status-badge mt-1.5 text-xs"
                    style={orderWorkflowCardBadgeStyle(statusBadge.color)}
                  >
                    {statusBadge.label}
                  </span>
                  <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                    Entrega: {deliveryWhen}
                  </p>
                </div>
              </section>
              <section className="exp-queue-swipe-section">
                <div className="exp-queue-swipe-section-inner">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Recebedor
                  </p>
                  <p className="mt-0.5 truncate text-sm font-semibold text-[var(--text-primary)]">
                    {displayOrDash(order.receiverName ?? order.customerName)}
                  </p>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Ponto de descarga
                  </p>
                  <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                    {displayOrDash(order.unloadingPoint)}
                  </p>
                </div>
              </section>
              <section className="exp-queue-swipe-section">
                <div className="exp-queue-swipe-section-inner">
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    {formatCurrency(order.totalValue)}
                  </p>
                  <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                    Transportadora: {displayOrDash(order.carrierName)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    NF:{' '}
                    {order.invoiceNumber?.trim()
                      ? order.invoiceNumber
                      : showNfPendente
                        ? 'Pendente'
                        : '—'}
                  </p>
                </div>
              </section>
              <section className="exp-queue-swipe-section">
                <div className="exp-queue-swipe-section-inner">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Observações
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-secondary)]">
                    {displayOrDash(order.obsExpedicao ?? order.notes)}
                  </p>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    CNPJ
                  </p>
                  <p className="mt-0.5 truncate text-xs font-medium text-[var(--text-primary)]">
                    {comprador}
                  </p>
                </div>
              </section>
            </div>
          </div>
          <div className="exp-queue-swipe-dots" role="tablist" aria-label="Seções do pedido">
            {Array.from({ length: SWIPE_SECTIONS }).map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={swipe.index === i}
                aria-label={`Seção ${i + 1}`}
                className={`exp-queue-swipe-dot${swipe.index === i ? ' exp-queue-swipe-dot--active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  swipe.goTo(i);
                }}
              />
            ))}
          </div>
        </div>
        {adminActions}
      </div>
    </div>
  );
}
