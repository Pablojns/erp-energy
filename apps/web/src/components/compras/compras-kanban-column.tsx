'use client';

import { useDroppable } from '@dnd-kit/core';
import type { KanbanColumnId, PurchaseRequest } from './compras-types';
import { ComprasCard } from './compras-card';

function ColumnSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, idx) => (
        <div
          key={idx}
          className="h-28 animate-pulse rounded-xl border border-white/10 bg-white/5"
        />
      ))}
    </div>
  );
}

export function ComprasKanbanColumn(props: {
  id: KanbanColumnId;
  label: string;
  items: PurchaseRequest[];
  loading: boolean;
  onOpenCard: (row: PurchaseRequest) => void;
  activeDragId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: props.id });

  return (
    <div className="flex h-full min-h-0 w-[280px] shrink-0 flex-col rounded-2xl border border-white/10 bg-black/25">
      <header className="shrink-0 border-b border-white/10 px-3 py-3">
        <h2 className="text-sm font-semibold text-white">{props.label}</h2>
        <p className="mt-0.5 text-xs text-white/45">{props.items.length} solicitações</p>
      </header>

      <div
        ref={setNodeRef}
        className={`min-h-0 flex-1 space-y-2 overflow-y-auto p-2 transition ${
          isOver ? 'bg-indigo-500/10 ring-1 ring-inset ring-indigo-400/30' : ''
        }`}
      >
        {props.loading ? (
          <ColumnSkeleton />
        ) : props.items.length === 0 ? (
          <div className="flex min-h-[8rem] items-center justify-center rounded-xl border border-dashed border-white/10 px-3 text-center text-xs text-white/35">
            Nenhum card nesta etapa
          </div>
        ) : (
          props.items.map((row) => (
            <ComprasCard
              key={row.id}
              row={row}
              onOpen={() => props.onOpenCard(row)}
              isDragging={props.activeDragId === row.id}
            />
          ))
        )}
      </div>
    </div>
  );
}
