'use client';

import { CrmKanbanCard } from '@/src/components/crm/crm-kanban-card';
import { EmptyState } from '@/src/components/ui/empty-state';
import { Users } from 'lucide-react';
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
  draggedCardId: string | null;
  movingId: string | null;
  isDropTarget: boolean;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragStart: (cardId: string) => void;
  onDragEnd: () => void;
  mobileMoveTargets?: CrmFunilDto[];
  onMobileMoveCard?: (cardId: string, funilId: string) => void;
}) {
  const accent = props.funil.color ?? 'var(--erp-accent)';

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  return (
    <div className="erp-module-panel flex h-full min-h-0 w-full shrink-0 flex-col md:w-[280px]">
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
        onDragEnter={(event) => {
          event.preventDefault();
          props.onDragEnter();
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            props.onDragLeave();
          }
        }}
        onDragOver={handleDragOver}
        onDrop={(event) => {
          event.preventDefault();
          props.onDrop();
        }}
        className={`lista-container space-y-2 p-2 transition ${
          props.isDropTarget
            ? 'bg-[var(--erp-accent-soft)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--erp-accent)_30%,transparent)]'
            : ''
        }`}
      >
        {props.loading ? (
          <ColumnSkeleton />
        ) : props.cards.length === 0 ? (
          <EmptyState
            compact
            className="border-none bg-transparent shadow-none"
            icon={Users}
            title="Nenhum lead neste funil"
            description="Crie um card ou importe leads para preencher esta coluna."
          />
        ) : (
          props.cards.map((card) => (
            <CrmKanbanCard
              key={card.id}
              card={card}
              onOpen={() => props.onOpenCard(card)}
              isDragging={props.draggedCardId === card.id}
              isMoving={props.movingId === card.id}
              onDragStart={props.onDragStart}
              onDragEnd={props.onDragEnd}
              moveTargets={props.mobileMoveTargets}
              onMoveToFunil={props.onMobileMoveCard}
            />
          ))
        )}
      </div>
    </div>
  );
}
