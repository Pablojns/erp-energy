'use client';

import { useDroppable } from '@dnd-kit/core';
import { ShoppingCart } from 'lucide-react';
import type { KanbanColumnId, PurchaseRequest } from './compras-types';
import { ComprasCard } from './compras-card';
import { EmptyState } from '@/src/components/ui/empty-state';

function ColumnSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, idx) => (
        <div
          key={idx}
          className="h-28 animate-pulse rounded-xl border border-[var(--erp-border)] bg-[var(--erp-bg-muted)]"
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
  dragEnabled?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: props.id });

  return (
    <div
      className={`erp-module-panel flex h-full min-h-0 shrink-0 flex-col ${
        props.dragEnabled === false
          ? 'w-full min-w-full max-w-full'
          : 'w-[280px]'
      }`}
    >
      <header className="shrink-0 border-b border-[var(--erp-border)] px-3 py-3">
        <h2 className="text-sm font-semibold text-[var(--erp-fg)]">{props.label}</h2>
        <p className="mt-0.5 text-xs text-[var(--erp-fg-muted)]">
          {props.items.length} solicitações
        </p>
      </header>

      <div
        ref={setNodeRef}
        className={`lista-container space-y-2 p-2 transition ${
          isOver
            ? 'bg-[var(--erp-accent-soft)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--erp-accent)_30%,transparent)]'
            : ''
        }`}
      >
        {props.loading ? (
          <ColumnSkeleton />
        ) : props.items.length === 0 ? (
          <EmptyState
            compact
            className="border-none bg-transparent shadow-none"
            icon={ShoppingCart}
            title="Nenhuma solicitação nesta etapa"
            description="Arraste cards para cá ou crie uma nova requisição de compra."
          />
        ) : (
          props.items.map((row) => (
            <ComprasCard
              key={row.id}
              row={row}
              onOpen={() => props.onOpenCard(row)}
              isDragging={props.activeDragId === row.id}
              dragEnabled={
                props.dragEnabled !== false && row.status !== 'RECUSADO'
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
