'use client';

import { useCallback, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { PurchaseRequest } from './compras-types';
import { TYPE_LABEL } from './compras-types';
import { ComprasBadge } from './compras-modal-shell';
import {
  calcPurchaseTotalFromRow,
  displayName,
  displayQty,
  displaySupplierName,
  formatDate,
  formatMoney,
  formatMoneyNumber,
  priorityBadgeClass,
  purchaseUnitPrice,
  typeBadgeClass,
} from './compras-utils';

const DRAG_ACTIVATION_DISTANCE = 8;

export function ComprasCard(props: {
  row: PurchaseRequest;
  onOpen: () => void;
  isDragging?: boolean;
  dragEnabled?: boolean;
}) {
  const { row, onOpen, isDragging: isDraggingOverlay, dragEnabled = true } = props;
  const pointerOrigin = useRef<{ x: number; y: number } | null>(null);
  const exceededDistance = useRef(false);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: row.id,
    data: { row },
    disabled: !dragEnabled,
  });

  const dragListeners = listeners
    ? {
        ...listeners,
        onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
          pointerOrigin.current = { x: event.clientX, y: event.clientY };
          exceededDistance.current = false;
          listeners.onPointerDown?.(event);
        },
        onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
          if (pointerOrigin.current) {
            const dx = event.clientX - pointerOrigin.current.x;
            const dy = event.clientY - pointerOrigin.current.y;
            if (Math.hypot(dx, dy) > DRAG_ACTIVATION_DISTANCE) {
              exceededDistance.current = true;
            }
          }
          listeners.onPointerMove?.(event);
        },
        onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
          listeners.onPointerUp?.(event);
          pointerOrigin.current = null;
        },
      }
    : undefined;

  const handleClick = useCallback(() => {
    if (exceededDistance.current || isDragging || isDraggingOverlay) return;
    onOpen();
  }, [isDragging, isDraggingOverlay, onOpen]);

  const dragging = isDragging || isDraggingOverlay;

  const style =
    dragging && transform
      ? { transform: CSS.Translate.toString(transform) }
      : undefined;

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...(dragEnabled ? attributes : {})}
      {...(dragEnabled ? dragListeners : {})}
      onClick={handleClick}
      className={`erp-module-card cursor-pointer p-2.5 transition md:p-3 ${
        dragEnabled
          ? ''
          : 'erp-compras-kanban-card-mobile w-full max-w-full'
      } ${
        dragging
          ? 'opacity-40'
          : 'hover:border-[color-mix(in_srgb,var(--erp-accent)_35%,transparent)]'
      }`}
    >
      <div className="mb-1 flex flex-wrap gap-1 md:mb-2 md:gap-1.5">
        <ComprasBadge tone={typeBadgeClass(row.type)}>{TYPE_LABEL[row.type]}</ComprasBadge>
        <ComprasBadge tone={priorityBadgeClass(row.priority)}>{row.priority}</ComprasBadge>
      </div>

      <h3 className="truncate text-sm font-semibold text-[var(--erp-fg)] md:line-clamp-2 md:whitespace-normal">
        {displayName(row)}
      </h3>
      {row.customerName?.trim() ? (
        <p className="mt-0.5 truncate text-xs font-medium text-[var(--erp-fg-secondary)] md:mt-1">
          Cliente: {row.customerName.trim()}
        </p>
      ) : null}
      {displaySupplierName(row) ? (
        <p className="mt-0.5 hidden truncate text-xs text-[var(--erp-fg-muted)] md:mt-1 md:block">
          {displaySupplierName(row)}
        </p>
      ) : null}
      <p className="mt-1 truncate text-xs text-[var(--erp-fg-secondary)] md:mt-2">
        Qtd. <span className="font-semibold text-[var(--erp-fg)]">{displayQty(row)}</span>
        <span className="hidden md:inline">
          {' · '}
          {row.type === 'WEG_CONTRATO' ? 'Base' : 'Preço'}{' '}
          <span className="font-semibold text-[var(--erp-fg)]">
            {row.type === 'WEG_CONTRATO'
              ? formatMoneyNumber(Number(purchaseUnitPrice(row)))
              : formatMoney(purchaseUnitPrice(row) || null)}
          </span>
          {' · '}
          Total{' '}
          <span className="font-semibold text-[var(--erp-fg)]">
            {formatMoneyNumber(calcPurchaseTotalFromRow(row))}
          </span>
        </span>
        <span className="font-semibold text-[var(--erp-fg)] md:hidden">
          {' · '}
          {formatMoneyNumber(calcPurchaseTotalFromRow(row))}
        </span>
      </p>
      <p className="mt-2 hidden text-xs text-[var(--erp-fg-muted)] md:block">
        {row.requestedBy.name} · {formatDate(row.createdAt)}
      </p>
      {row.expectedArrival ? (
        <p className="mt-0.5 hidden text-xs text-[var(--erp-fg-muted)] md:block">
          Previsão: {formatDate(row.expectedArrival)}
        </p>
      ) : null}
    </article>
  );
}

export function ComprasCardPreview(props: { row: PurchaseRequest }) {
  const { row } = props;
  return (
    <article className="erp-module-card w-[260px] rotate-2 border-[color-mix(in_srgb,var(--erp-accent)_40%,transparent)] p-3 shadow-2xl">
      <div className="mb-2 flex flex-wrap gap-1.5">
        <ComprasBadge tone={typeBadgeClass(row.type)}>{TYPE_LABEL[row.type]}</ComprasBadge>
        <ComprasBadge tone={priorityBadgeClass(row.priority)}>{row.priority}</ComprasBadge>
      </div>
      <h3 className="line-clamp-2 text-sm font-semibold text-[var(--erp-fg)]">{displayName(row)}</h3>
      {displaySupplierName(row) ? (
        <p className="mt-1 truncate text-xs text-[var(--erp-fg-muted)]">{displaySupplierName(row)}</p>
      ) : null}
    </article>
  );
}
