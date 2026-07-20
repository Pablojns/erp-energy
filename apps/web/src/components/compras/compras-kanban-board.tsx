'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { updatePurchaseStatus } from './compras-api';
import { ComprasCardPreview } from './compras-card';
import { ComprasKanbanColumn } from './compras-kanban-column';
import { MobileKanbanCarousel } from '@/src/components/mobile/mobile-kanban-carousel';
import type { KanbanColumnId, PurchaseRequest } from './compras-types';
import { KANBAN_COLUMNS } from './compras-types';
import { kanbanColumnForStatus } from './compras-utils';
import { useIsMobileKanban } from '@/src/hooks/use-is-mobile-kanban';

export function ComprasKanbanBoard(props: {
  rows: PurchaseRequest[];
  loading: boolean;
  onOpenCard: (row: PurchaseRequest) => void;
  onStatusChanged: (updated: PurchaseRequest) => void;
  onError: (message: string) => void;
}) {
  const isMobileView = useIsMobileKanban();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const grouped = useMemo(() => {
    const map = Object.fromEntries(
      KANBAN_COLUMNS.map((column) => [column.id, [] as PurchaseRequest[]]),
    ) as Record<KanbanColumnId, PurchaseRequest[]>;

    for (const row of props.rows) {
      const columnId = kanbanColumnForStatus(row.status);
      if (columnId) {
        map[columnId].push(row);
      }
    }

    return map;
  }, [props.rows]);

  const activeRow = activeId
    ? props.rows.find((row) => row.id === activeId) ?? null
    : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const purchaseId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;

    const targetColumn = resolveTargetColumn(overId, props.rows);
    if (!targetColumn || targetColumn === 'RECUSADO') return;

    const row = props.rows.find((item) => item.id === purchaseId);
    if (!row) return;

    const currentColumn = kanbanColumnForStatus(row.status);
    if (!currentColumn || currentColumn === 'RECUSADO' || currentColumn === targetColumn) {
      return;
    }

    setMovingId(purchaseId);
    try {
      const updated = await updatePurchaseStatus(purchaseId, targetColumn);
      props.onStatusChanged(updated);
    } catch (err) {
      props.onError(err instanceof Error ? err.message : 'Falha ao mover solicitação.');
    } finally {
      setMovingId(null);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={(event) => void handleDragEnd(event)}
    >
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {isMobileView ? (
        <div className="flex min-h-0 flex-1">
          <MobileKanbanCarousel
            columns={KANBAN_COLUMNS.map((c) => ({ id: c.id, title: c.label }))}
            renderColumn={(column) => (
              <ComprasKanbanColumn
                key={column.id}
                id={column.id as KanbanColumnId}
                label={column.title}
                items={grouped[column.id as KanbanColumnId]}
                loading={props.loading}
                onOpenCard={props.onOpenCard}
                activeDragId={activeId ?? movingId}
                dragEnabled={false}
              />
            )}
          />
        </div>
      ) : (
        <div className="flex h-full min-h-0 gap-3 overflow-x-auto pb-2">
          {KANBAN_COLUMNS.map((column) => (
            <ComprasKanbanColumn
              key={column.id}
              id={column.id}
              label={column.label}
              items={grouped[column.id]}
              loading={props.loading}
              onOpenCard={props.onOpenCard}
              activeDragId={activeId ?? movingId}
              dragEnabled
            />
          ))}
        </div>
      )}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeRow ? <ComprasCardPreview row={activeRow} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function resolveTargetColumn(
  overId: string,
  rows: PurchaseRequest[],
): KanbanColumnId | null {
  if (KANBAN_COLUMNS.some((column) => column.id === overId)) {
    return overId as KanbanColumnId;
  }
  const targetRow = rows.find((row) => row.id === overId);
  if (!targetRow) return null;
  return kanbanColumnForStatus(targetRow.status);
}
