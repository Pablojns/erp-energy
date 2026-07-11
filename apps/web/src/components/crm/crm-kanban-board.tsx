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
import { CrmKanbanColumn } from '@/src/components/crm/crm-kanban-column';
import { CrmKanbanCardPreview } from '@/src/components/crm/crm-kanban-card';
import {
  moveCrmCard,
  type CrmCardDto,
  type CrmFunilDto,
} from '@/src/services/api/crm-api';

export function CrmKanbanBoard(props: {
  funis: CrmFunilDto[];
  cards: CrmCardDto[];
  loading: boolean;
  onOpenCard: (card: CrmCardDto) => void;
  onCardMoved: (updated: CrmCardDto) => void;
  onError: (message: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const grouped = useMemo(() => {
    const map = Object.fromEntries(
      props.funis.map((funil) => [funil.id, [] as CrmCardDto[]]),
    ) as Record<string, CrmCardDto[]>;

    for (const card of props.cards) {
      if (map[card.funilId]) {
        map[card.funilId].push(card);
      }
    }

    return map;
  }, [props.cards, props.funis]);

  const activeCard = activeId
    ? props.cards.find((card) => card.id === activeId) ?? null
    : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const cardId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;

    const targetFunilId = resolveTargetFunilId(overId, props.funis, props.cards);
    if (!targetFunilId) return;

    const card = props.cards.find((item) => item.id === cardId);
    if (!card || card.funilId === targetFunilId) return;

    setMovingId(cardId);
    try {
      const updated = await moveCrmCard(cardId, targetFunilId);
      props.onCardMoved(updated);
    } catch (err) {
      props.onError(err instanceof Error ? err.message : 'Falha ao mover card.');
    } finally {
      setMovingId(null);
    }
  };

  if (!props.loading && props.funis.length === 0) {
    return (
      <div className="flex min-h-[12rem] flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--erp-border)] p-6 text-center text-sm text-[var(--erp-fg-muted)]">
        Crie um funil para começar a organizar seus leads no kanban.
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={(event) => void handleDragEnd(event)}
    >
      <div className="flex h-full min-h-0 gap-3 overflow-x-auto pb-2">
        {props.funis.map((funil) => (
          <CrmKanbanColumn
            key={funil.id}
            funil={funil}
            cards={grouped[funil.id] ?? []}
            loading={props.loading}
            onOpenCard={props.onOpenCard}
            activeDragId={activeId ?? movingId}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeCard ? <CrmKanbanCardPreview card={activeCard} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function resolveTargetFunilId(
  overId: string,
  funis: CrmFunilDto[],
  cards: CrmCardDto[],
): string | null {
  if (funis.some((funil) => funil.id === overId)) {
    return overId;
  }
  const targetCard = cards.find((card) => card.id === overId);
  return targetCard?.funilId ?? null;
}
