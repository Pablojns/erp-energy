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
import type { PurchaseRequest, PurchaseStage } from './compras-types';
import { stageIdForStatus } from './compras-utils';
import { useIsMobileKanban } from '@/src/hooks/use-is-mobile-kanban';

export function ComprasKanbanBoard(props: {
  rows: PurchaseRequest[];
  stages: PurchaseStage[];
  loading: boolean;
  onOpenCard: (row: PurchaseRequest) => void;
  onStatusChanged: (updated: PurchaseRequest) => void;
  onError: (message: string) => void;
  /** Etapa de destino exige popup (valor/data ou motivo) antes de mover. */
  onStageRequiresInput: (row: PurchaseRequest, stage: PurchaseStage) => void;
}) {
  const isMobileView = useIsMobileKanban();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const grouped = useMemo(() => {
    const map = Object.fromEntries(
      props.stages.map((stage) => [stage.id, [] as PurchaseRequest[]]),
    ) as Record<string, PurchaseRequest[]>;

    for (const row of props.rows) {
      const stageId = stageIdForStatus(row.status, props.stages);
      if (stageId && map[stageId]) {
        map[stageId].push(row);
      }
    }

    return map;
  }, [props.rows, props.stages]);

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

    const targetStageId = resolveTargetStage(overId, props.rows, props.stages);
    if (!targetStageId) return;

    const row = props.rows.find((item) => item.id === purchaseId);
    if (!row) return;

    const currentStageId = stageIdForStatus(row.status, props.stages);
    if (!currentStageId || currentStageId === targetStageId) {
      return;
    }

    const targetStage = props.stages.find((stage) => stage.id === targetStageId);
    if (!targetStage) return;

    // Etapa pede valor/data ou motivo: o popup confirma o movimento.
    if (targetStage.requiresPurchaseDetails || targetStage.requiresReason) {
      props.onStageRequiresInput(row, targetStage);
      return;
    }

    setMovingId(purchaseId);
    try {
      const updated = await updatePurchaseStatus(purchaseId, targetStageId);
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
            columns={props.stages.map((stage) => ({ id: stage.id, title: stage.name }))}
            renderColumn={(column) => (
              <ComprasKanbanColumn
                key={column.id}
                id={column.id}
                label={column.title}
                color={
                  props.stages.find((stage) => stage.id === column.id)?.color ?? null
                }
                items={grouped[column.id] ?? []}
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
          {props.stages.map((stage) => (
            <ComprasKanbanColumn
              key={stage.id}
              id={stage.id}
              label={stage.name}
              color={stage.color}
              items={grouped[stage.id] ?? []}
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

function resolveTargetStage(
  overId: string,
  rows: PurchaseRequest[],
  stages: PurchaseStage[],
): string | null {
  if (stages.some((stage) => stage.id === overId)) {
    return overId;
  }
  const targetRow = rows.find((row) => row.id === overId);
  if (!targetRow) return null;
  return stageIdForStatus(targetRow.status, stages);
}
