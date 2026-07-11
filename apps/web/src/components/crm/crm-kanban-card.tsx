'use client';

import { useCallback, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  CRM_ORIGIN_BADGE_CLASS,
  CRM_ORIGIN_LABEL,
  formatCrmCurrency,
  type CrmCardDto,
} from '@/src/services/api/crm-api';

const DRAG_ACTIVATION_DISTANCE = 8;

export function CrmKanbanCard(props: {
  card: CrmCardDto;
  onOpen: () => void;
  isDragging?: boolean;
}) {
  const { card, onOpen, isDragging: isDraggingOverlay } = props;
  const pointerOrigin = useRef<{ x: number; y: number } | null>(null);
  const exceededDistance = useRef(false);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { card },
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

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  const dragging = isDragging || isDraggingOverlay;

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...dragListeners}
      onClick={handleClick}
      className={`erp-module-card cursor-pointer p-3 transition ${
        dragging
          ? 'opacity-40'
          : 'hover:border-[color-mix(in_srgb,var(--erp-accent)_35%,transparent)]'
      } ${card.statusMeta?.name === 'Fechado' || card.statusMeta?.name === 'Perdido' ? 'opacity-75' : ''}`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${CRM_ORIGIN_BADGE_CLASS[card.origin]}`}
        >
          {CRM_ORIGIN_LABEL[card.origin]}
        </span>
        {card.statusMeta &&
        (card.statusMeta.name === 'Fechado' || card.statusMeta.name === 'Perdido') ? (
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--erp-fg-muted)]">
            {card.statusMeta.name}
          </span>
        ) : null}
      </div>
      <h3 className="line-clamp-2 text-sm font-semibold text-[var(--erp-fg)]">{card.name}</h3>
      <p className="mt-2 text-xs text-[var(--erp-fg-secondary)]">
        {card.value ? (
          <>
            Valor{' '}
            <span className="font-semibold text-[var(--erp-fg)]">
              {formatCrmCurrency(card.value)}
            </span>
            {' · '}
          </>
        ) : null}
        Touchpoints{' '}
        <span className="font-semibold text-[var(--erp-fg)]">{card.touchPoints}</span>
      </p>
    </article>
  );
}

export function CrmKanbanCardPreview(props: { card: CrmCardDto }) {
  const { card } = props;
  return (
    <article className="erp-module-card w-[260px] rotate-2 border-[color-mix(in_srgb,var(--erp-accent)_40%,transparent)] p-3 shadow-2xl">
      <span
        className={`mb-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${CRM_ORIGIN_BADGE_CLASS[card.origin]}`}
      >
        {CRM_ORIGIN_LABEL[card.origin]}
      </span>
      <h3 className="line-clamp-2 text-sm font-semibold text-[var(--erp-fg)]">{card.name}</h3>
    </article>
  );
}
