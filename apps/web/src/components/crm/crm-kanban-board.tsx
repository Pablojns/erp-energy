'use client';

import { useMemo, useState } from 'react';
import { CrmKanbanColumn } from '@/src/components/crm/crm-kanban-column';
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
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dropTargetFunilId, setDropTargetFunilId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

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

  const handleDragStart = (cardId: string) => {
    setDraggedCardId(cardId);
  };

  const handleDragEnd = () => {
    setDraggedCardId(null);
    setDropTargetFunilId(null);
  };

  const handleDrop = async (funilId: string) => {
    const cardId = draggedCardId;
    setDropTargetFunilId(null);
    if (!cardId) return;

    const card = props.cards.find((item) => item.id === cardId);
    if (!card || card.funilId === funilId) {
      handleDragEnd();
      return;
    }

    setMovingId(cardId);
    try {
      const updated = await moveCrmCard(cardId, funilId);
      props.onCardMoved(updated);
    } catch (err) {
      props.onError(err instanceof Error ? err.message : 'Falha ao mover card.');
    } finally {
      setMovingId(null);
      handleDragEnd();
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
    <div className="flex h-full min-h-0 gap-3 overflow-x-auto pb-2">
      {props.funis.map((funil) => (
        <CrmKanbanColumn
          key={funil.id}
          funil={funil}
          cards={grouped[funil.id] ?? []}
          loading={props.loading}
          onOpenCard={props.onOpenCard}
          draggedCardId={draggedCardId}
          movingId={movingId}
          isDropTarget={dropTargetFunilId === funil.id}
          onDragEnter={() => setDropTargetFunilId(funil.id)}
          onDragLeave={() =>
            setDropTargetFunilId((current) =>
              current === funil.id ? null : current,
            )
          }
          onDrop={() => void handleDrop(funil.id)}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
      ))}
    </div>
  );
}
