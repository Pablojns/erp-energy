'use client';

import { useCallback, useRef } from 'react';
import { crmUserInitials, isCrmFollowUpOverdue } from '@/src/components/crm/crm-helpers';
import {
  CRM_ORIGIN_BADGE_CLASS,
  CRM_ORIGIN_LABEL,
  formatCrmCurrency,
  type CrmCardDto,
} from '@/src/services/api/crm-api';

const DRAG_MIME = 'application/x-crm-card-id';

export function CrmKanbanCard(props: {
  card: CrmCardDto;
  onOpen: () => void;
  isDragging?: boolean;
  isMoving?: boolean;
  onDragStart: (cardId: string) => void;
  onDragEnd: () => void;
}) {
  const { card, onOpen, isDragging, isMoving, onDragStart, onDragEnd } = props;
  const didDrag = useRef(false);
  const followUpOverdue = isCrmFollowUpOverdue(card);

  const handleDragStart = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      didDrag.current = true;
      event.dataTransfer.setData(DRAG_MIME, card.id);
      event.dataTransfer.setData('text/plain', card.id);
      event.dataTransfer.effectAllowed = 'move';
      onDragStart(card.id);
    },
    [card.id, onDragStart],
  );

  const handleDragEnd = useCallback(() => {
    onDragEnd();
    window.setTimeout(() => {
      didDrag.current = false;
    }, 0);
  }, [onDragEnd]);

  const handleClick = useCallback(() => {
    if (didDrag.current || isDragging || isMoving) return;
    onOpen();
  }, [isDragging, isMoving, onOpen]);

  const dragging = isDragging || isMoving;

  return (
    <article
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      className={`erp-module-card relative cursor-grab p-3 transition active:cursor-grabbing ${
        dragging
          ? 'opacity-40'
          : 'hover:border-[color-mix(in_srgb,var(--erp-accent)_35%,transparent)]'
      } ${card.statusMeta?.name === 'Fechado' || card.statusMeta?.name === 'Perdido' ? 'opacity-75' : ''}`}
    >
      {followUpOverdue ? (
        <span
          className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-rose-500/30"
          title="Sem contato há mais de 3 dias"
          aria-label="Follow-up atrasado"
        />
      ) : null}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {card.responsavel ? (
          <span
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--erp-accent)_35%,transparent)] text-[10px] font-bold text-[var(--erp-fg)]"
            title={card.responsavel.name}
          >
            {crmUserInitials(card.responsavel.name)}
          </span>
        ) : null}
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
