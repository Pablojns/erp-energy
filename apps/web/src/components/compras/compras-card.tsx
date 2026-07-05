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
  formatDate,
  formatMoney,
  formatMoneyNumber,
  priorityBadgeClass,
  typeBadgeClass,
} from './compras-utils';

const DRAG_ACTIVATION_DISTANCE = 8;

export function ComprasCard(props: {
  row: PurchaseRequest;
  onOpen: () => void;
  isDragging?: boolean;
}) {
  const { row, onOpen, isDragging: isDraggingOverlay } = props;
  const pointerOrigin = useRef<{ x: number; y: number } | null>(null);
  const exceededDistance = useRef(false);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: row.id,
    data: { row },
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

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  const dragging = isDragging || isDraggingOverlay;

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...dragListeners}
      onClick={handleClick}
      className={`cursor-pointer rounded-xl border border-white/10 bg-[#0d1018] p-3 shadow-lg transition ${
        dragging ? 'opacity-40' : 'hover:border-indigo-400/40 hover:bg-white/[0.04]'
      }`}
    >
      <div className="mb-2 flex flex-wrap gap-1.5">
        <ComprasBadge className={typeBadgeClass(row.type)}>{TYPE_LABEL[row.type]}</ComprasBadge>
        <ComprasBadge className={priorityBadgeClass(row.priority)}>{row.priority}</ComprasBadge>
      </div>

      <h3 className="line-clamp-2 text-sm font-semibold text-white">{displayName(row)}</h3>
      {row.supplierName ? (
        <p className="mt-1 truncate text-xs text-white/50">{row.supplierName}</p>
      ) : null}
      <p className="mt-2 text-xs text-white/60">
        Qtd. <span className="font-semibold text-white">{displayQty(row)}</span>
        {' · '}
        Preço <span className="font-semibold text-white">{formatMoney(row.itemPrice)}</span>
        {' · '}
        Total <span className="font-semibold text-white">{formatMoneyNumber(calcPurchaseTotalFromRow(row))}</span>
      </p>
      <p className="mt-2 text-[11px] text-white/40">
        {row.requestedBy.name} · {formatDate(row.createdAt)}
      </p>
    </article>
  );
}

export function ComprasCardPreview(props: { row: PurchaseRequest }) {
  const { row } = props;
  return (
    <article className="w-[260px] rotate-2 rounded-xl border border-indigo-400/50 bg-[#121722] p-3 shadow-2xl">
      <div className="mb-2 flex flex-wrap gap-1.5">
        <ComprasBadge className={typeBadgeClass(row.type)}>{TYPE_LABEL[row.type]}</ComprasBadge>
        <ComprasBadge className={priorityBadgeClass(row.priority)}>{row.priority}</ComprasBadge>
      </div>
      <h3 className="line-clamp-2 text-sm font-semibold text-white">{displayName(row)}</h3>
      {row.supplierName ? (
        <p className="mt-1 truncate text-xs text-white/50">{row.supplierName}</p>
      ) : null}
    </article>
  );
}
