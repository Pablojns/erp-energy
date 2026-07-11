'use client';

import { useDroppable } from '@dnd-kit/core';
import { CrmKanbanCard } from '@/src/components/crm/crm-kanban-card';
import type { CrmCardDto, CrmFunilDto } from '@/src/services/api/crm-api';

function ColumnSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, idx) => (
        <div
          key={idx}
          className="h-24 animate-pulse rounded-xl border border-[var(--erp-border)] bg-[var(--erp-bg-muted)]"
        />
      ))}
    </div>
  );
}

export function CrmKanbanColumn(props: {
  funil: CrmFunilDto;
  cards: CrmCardDto[];
  loading: boolean;
  onOpenCard: (card: CrmCardDto) => void;
  activeDragId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: props.funil.id });

  const accent = props.funil.color ?? 'var(--erp-accent)';

  return (
    <div className="erp-module-panel flex h-full min-h-0 w-[280px] shrink-0 flex-col">
      <header
        className="shrink-0 border-b border-[var(--erp-border)] px-3 py-3"
        style={{ borderTopWidth: 3, borderTopColor: accent, borderTopStyle: 'solid' }}
      >
        <h2 className="text-sm font-semibold text-[var(--erp-fg)]">{props.funil.name}</h2>
        <p className="mt-0.5 text-xs text-[var(--erp-fg-muted)]">
          {props.cards.length} {props.cards.length === 1 ? 'lead' : 'leads'}
        </p>
      </header>

      <div
        ref={setNodeRef}
        className={`min-h-0 flex-1 space-y-2 overflow-y-auto p-2 transition ${
          isOver
            ? 'bg-[var(--erp-accent-soft)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--erp-accent)_30%,transparent)]'
            : ''
        }`}
      >
        {props.loading ? (
          <ColumnSkeleton />
        ) : props.cards.length === 0 ? (
          <div className="flex min-h-[8rem] items-center justify-center rounded-xl border border-dashed border-[var(--erp-border)] px-3 text-center text-xs text-[var(--erp-fg-muted)]">
            Nenhum card neste funil
          </div>
        ) : (
          props.cards.map((card) => (
            <CrmKanbanCard
              key={card.id}
              card={card}
              onOpen={() => props.onOpenCard(card)}
              isDragging={props.activeDragId === card.id}
            />
          ))
        )}
      </div>
    </div>
  );
}
