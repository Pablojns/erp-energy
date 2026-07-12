'use client';

import { useCallback, useRef } from 'react';
import { MessageCircle, XCircle } from 'lucide-react';
import { crmUserInitials, isCrmFollowUpOverdue } from '@/src/components/crm/crm-helpers';
import { CrmLeadScoreThermometer } from '@/src/components/crm/crm-lead-score';
import {
  CRM_ORIGIN_BADGE_CLASS,
  CRM_ORIGIN_LABEL,
  formatCrmCurrency,
  type CrmCardDto,
} from '@/src/services/api/crm-api';

const DRAG_MIME = 'application/x-crm-card-id';

function isPerdido(card: CrmCardDto) {
  return card.statusMeta?.name === 'Perdido';
}

function isFechado(card: CrmCardDto) {
  return card.statusMeta?.name === 'Fechado';
}

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
  const perdido = isPerdido(card);
  const fechado = isFechado(card);

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
      className={`erp-module-card relative cursor-grab p-3.5 transition active:cursor-grabbing ${
        dragging
          ? 'opacity-40'
          : 'hover:border-[color-mix(in_srgb,var(--erp-accent)_35%,transparent)]'
      } ${fechado || perdido ? 'opacity-90' : ''}`}
    >
      {followUpOverdue ? (
        <span
          className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-rose-500/30"
          title="Sem contato há mais de 3 dias"
          aria-label="Follow-up atrasado"
        />
      ) : null}

      {card.responsavel ? (
        <span
          className="absolute right-2.5 top-2.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--erp-accent)_35%,transparent)] text-[10px] font-bold text-[var(--erp-fg)]"
          title={card.responsavel.name}
        >
          {crmUserInitials(card.responsavel.name)}
        </span>
      ) : null}

      <div className="space-y-2.5 pr-8">
        {/* 1. Nome */}
        <h3 className="line-clamp-2 text-base font-bold leading-snug text-[var(--erp-fg)]">
          {card.name}
        </h3>

        {/* 2. Status */}
        {card.statusMeta ? (
          perdido ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/70 bg-rose-500/25 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-rose-100">
              <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {card.statusMeta.name}
            </span>
          ) : (
            <span
              className="inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
              style={{
                borderColor: `${card.statusMeta.color}88`,
                backgroundColor: `${card.statusMeta.color}33`,
                color: card.statusMeta.color,
              }}
            >
              {card.statusMeta.name}
            </span>
          )
        ) : null}

        {/* 3. Origem */}
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${CRM_ORIGIN_BADGE_CLASS[card.origin]}`}
        >
          {CRM_ORIGIN_LABEL[card.origin]}
        </span>

        {/* 4. Valor */}
        {card.value ? (
          <p className="text-sm font-bold text-emerald-300">
            {formatCrmCurrency(card.value)}
          </p>
        ) : null}

        {/* 5. Motivo perda (se perdido) */}
        {perdido && card.motivoPerdaMeta ? (
          <div className="rounded-lg border border-rose-400/40 bg-rose-500/15 px-2.5 py-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-rose-200">
              Motivo: {card.motivoPerdaMeta.name}
            </p>
            {card.motivoPerdaTexto ? (
              <p className="mt-0.5 line-clamp-2 text-xs text-rose-100/90">
                {card.motivoPerdaTexto}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* 6. Score */}
        <CrmLeadScoreThermometer score={card.score ?? 0} prominent showLabel />

        {/* Touchpoints */}
        <div className="flex items-center gap-1.5 text-xs text-[var(--erp-fg-secondary)]">
          <MessageCircle className="h-3.5 w-3.5 shrink-0 text-[var(--erp-fg-muted)]" aria-hidden />
          <span>
            <span className="font-semibold text-[var(--erp-fg)]">{card.touchPoints}</span>
            {' '}
            touchpoint{card.touchPoints === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </article>
  );
}

export function CrmKanbanCardPreview(props: { card: CrmCardDto }) {
  const { card } = props;
  return (
    <article className="erp-module-card w-[260px] rotate-2 border-[color-mix(in_srgb,var(--erp-accent)_40%,transparent)] p-3.5 shadow-2xl">
      <h3 className="line-clamp-2 text-base font-bold text-[var(--erp-fg)]">{card.name}</h3>
      <span
        className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${CRM_ORIGIN_BADGE_CLASS[card.origin]}`}
      >
        {CRM_ORIGIN_LABEL[card.origin]}
      </span>
    </article>
  );
}
