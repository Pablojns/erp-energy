'use client';

import { useCallback, useRef, useState } from 'react';
import { MessageCircle, XCircle } from 'lucide-react';
import { MobileBottomDrawer } from '@/src/components/mobile/mobile-bottom-drawer';
import { crmUserInitials, isCrmFollowUpOverdue } from '@/src/components/crm/crm-helpers';
import { CrmLeadScoreThermometer } from '@/src/components/crm/crm-lead-score';
import {
  CRM_ORIGIN_BADGE_CLASS,
  CRM_ORIGIN_LABEL,
  formatCrmCurrency,
  type CrmCardDto,
} from '@/src/services/api/crm-api';
import type { CrmFunilDto } from '@/src/services/api/crm-api';

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
  moveTargets?: CrmFunilDto[];
  onMoveToFunil?: (cardId: string, funilId: string) => void;
}) {
  const { card, onOpen, isDragging, isMoving, onDragStart, onDragEnd, moveTargets, onMoveToFunil } = props;
  const didDrag = useRef(false);
  const longPressTimer = useRef<number | null>(null);
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
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

  const handleTouchStart = () => {
    if (!moveTargets?.length || !onMoveToFunil) return;
    longPressTimer.current = window.setTimeout(() => {
      setMoveMenuOpen(true);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const dragging = isDragging || isMoving;

  return (
    <>
    <article
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={`erp-module-card relative min-h-0 max-h-[72px] cursor-grab overflow-hidden p-2.5 transition active:cursor-grabbing md:max-h-none md:min-h-0 md:overflow-visible md:p-3.5 ${
        dragging
          ? 'opacity-40'
          : 'hover:border-[color-mix(in_srgb,var(--erp-accent)_35%,transparent)]'
      } ${fechado || perdido ? 'opacity-90' : ''}`}
    >
      {followUpOverdue ? (
        <span
          className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-rose-500/30 md:h-2.5 md:w-2.5"
          title="Sem contato há mais de 3 dias"
          aria-label="Follow-up atrasado"
        />
      ) : null}

      {card.responsavel ? (
        <span
          className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--erp-accent)_35%,transparent)] text-[10px] font-bold text-[var(--erp-fg)] md:inline-flex md:right-2.5 md:top-2.5"
          title={card.responsavel.name}
        >
          {crmUserInitials(card.responsavel.name)}
        </span>
      ) : null}

      <div className="space-y-1 pr-2 md:space-y-2.5 md:pr-8">
        {/* 1. Nome */}
        <h3 className="line-clamp-1 text-sm font-semibold leading-snug text-[var(--erp-fg)] md:line-clamp-2 md:text-base md:font-bold">
          {card.name}
        </h3>

        {/* 2. Status */}
        {card.statusMeta ? (
          perdido ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-800 md:px-2.5 md:py-1 md:text-[11px]">
              <XCircle className="h-3 w-3 shrink-0 md:h-3.5 md:w-3.5" aria-hidden />
              {card.statusMeta.name}
            </span>
          ) : (
            <span
              className="inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide md:px-2.5 md:py-1 md:text-[11px]"
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

        {/* 3. Origem — desktop only */}
        <span
          className={`hidden rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide md:inline-flex ${CRM_ORIGIN_BADGE_CLASS[card.origin]}`}
        >
          {CRM_ORIGIN_LABEL[card.origin]}
        </span>

        {/* 4. Valor */}
        {card.value ? (
          <p className="truncate text-xs font-semibold text-emerald-700 md:text-sm md:font-bold">
            {formatCrmCurrency(card.value)}
          </p>
        ) : null}

        {/* 5. Motivo perda (se perdido) */}
        {perdido && card.motivoPerdaMeta ? (
          <div className="hidden rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 md:block">
            <p className="text-[11px] font-bold uppercase tracking-wide text-rose-700">
              Motivo: {card.motivoPerdaMeta.name}
            </p>
            {card.motivoPerdaTexto ? (
              <p className="mt-0.5 line-clamp-2 text-xs text-rose-600">
                {card.motivoPerdaTexto}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* 6. Score */}
        <div className="hidden md:block">
          <CrmLeadScoreThermometer score={card.score ?? 0} prominent showLabel />
        </div>

        {/* Touchpoints */}
        <div className="hidden items-center gap-1.5 text-xs text-[var(--erp-fg-secondary)] md:flex">
          <MessageCircle className="h-3.5 w-3.5 shrink-0 text-[var(--erp-fg-muted)]" aria-hidden />
          <span>
            <span className="font-semibold text-[var(--erp-fg)]">{card.touchPoints}</span>
            {' '}
            touchpoint{card.touchPoints === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </article>
    <MobileBottomDrawer
      open={moveMenuOpen}
      onClose={() => setMoveMenuOpen(false)}
      title="Mover para…"
    >
      <div className="grid gap-1">
        {(moveTargets ?? [])
          .filter((f) => f.id !== card.funilId)
          .map((funil) => (
            <button
              key={funil.id}
              type="button"
              className="erp-mobile-action-item"
              onClick={() => {
                setMoveMenuOpen(false);
                onMoveToFunil?.(card.id, funil.id);
              }}
            >
              {funil.name}
            </button>
          ))}
      </div>
    </MobileBottomDrawer>
    </>
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
