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
      className={`erp-module-card cursor-pointer p-3 transition ${
        dragging
          ? 'opacity-40'
          : 'hover:border-[color-mix(in_srgb,var(--erp-accent)_35%,transparent)]'
      }`}
    >
      <div className="mb-2 flex flex-wrap gap-1.5">
        <ComprasBadge tone={typeBadgeClass(row.type)}>{TYPE_LABEL[row.type]}</ComprasBadge>
        <ComprasBadge tone={priorityBadgeClass(row.priority)}>{row.priority}</ComprasBadge>
      </div>

      <h3 className="line-clamp-2 text-sm font-semibold text-[var(--erp-fg)]">{displayName(row)}</h3>
      {displaySupplierName(row) ? (
        <p className="mt-1 truncate text-xs text-[var(--erp-fg-muted)]">{displaySupplierName(row)}</p>
      ) : null}
      <p className="mt-2 text-xs text-[var(--erp-fg-secondary)]">
        Qtd. <span className="font-semibold text-[var(--erp-fg)]">{displayQty(row)}</span>
        {' · '}
        {row.type === 'WEG_CONTRATO' ? 'Base' : 'Preço'}{' '}
        <span className="font-semibold text-[var(--erp-fg)]">
          {row.type === 'WEG_CONTRATO'
            ? formatMoneyNumber(Number(purchaseUnitPrice(row)))
            : formatMoney(purchaseUnitPrice(row) || null)}
        </span>
        {' · '}
        Total <span className="font-semibold text-[var(--erp-fg)]">{formatMoneyNumber(calcPurchaseTotalFromRow(row))}</span>
      </p>
      <p className="mt-2 text-xs text-[var(--erp-fg-muted)]">
        {row.requestedBy.name} · {formatDate(row.createdAt)}
      </p>
      {row.expectedArrival ? (
        <p className="mt-0.5 text-xs text-[var(--erp-fg-muted)]">
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
