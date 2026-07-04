'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { PurchaseRequest } from './compras-types';
import { TYPE_LABEL } from './compras-types';
import { ComprasBadge } from './compras-modal-shell';
import {
  displayName,
  displayQty,
  formatDate,
  formatMoney,
  priorityBadgeClass,
  typeBadgeClass,
} from './compras-utils';

export function ComprasCard(props: {
  row: PurchaseRequest;
  onOpen: () => void;
  isDragging?: boolean;
}) {
  const { row, onOpen, isDragging } = props;
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: row.id,
    data: { row },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border border-white/10 bg-[#0d1018] p-3 shadow-lg transition ${
        isDragging ? 'opacity-40' : 'hover:border-indigo-400/40 hover:bg-white/[0.04]'
      }`}
    >
      <div className="mb-2 flex flex-wrap gap-1.5">
        <ComprasBadge className={typeBadgeClass(row.type)}>{TYPE_LABEL[row.type]}</ComprasBadge>
        <ComprasBadge className={priorityBadgeClass(row.priority)}>{row.priority}</ComprasBadge>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left"
      >
        <h3 className="line-clamp-2 text-sm font-semibold text-white">{displayName(row)}</h3>
        {row.supplierName ? (
          <p className="mt-1 truncate text-xs text-white/50">{row.supplierName}</p>
        ) : null}
        <p className="mt-2 text-xs text-white/60">
          Qtd. <span className="font-semibold text-white">{displayQty(row)}</span>
          {' · '}
          Preço <span className="font-semibold text-white">{formatMoney(row.itemPrice)}</span>
        </p>
        <p className="mt-2 text-[11px] text-white/40">
          {row.requestedBy.name} · {formatDate(row.createdAt)}
        </p>
      </button>

      <div
        {...listeners}
        {...attributes}
        className="mt-2 cursor-grab rounded-lg border border-dashed border-white/10 px-2 py-1 text-center text-[10px] uppercase tracking-wide text-white/30 active:cursor-grabbing"
        aria-label="Arrastar card"
      >
        Arrastar
      </div>
    </article>
  );
}

export function ComprasCardPreview(props: { row: PurchaseRequest }) {
  const { row } = props;
  return (
    <article className="w-[260px] rotate-2 rounded-xl border border-indigo-400/50 bg-[#121722] p-3 shadow-2xl">
      <div className="mb-2 flex flex-wrap gap-1.5">
        <ComprasBadge className={typeBadgeClass(row.type)}>{TYPE_LABEL[row.type]}</ComprasBadge>
        <ComprasBadge className={priorityBadgeClass(row.priority)}>{row.priority}</ComprasBadge>
      </div>
      <h3 className="line-clamp-2 text-sm font-semibold text-white">{displayName(row)}</h3>
      {row.supplierName ? (
        <p className="mt-1 truncate text-xs text-white/50">{row.supplierName}</p>
      ) : null}
    </article>
  );
}
