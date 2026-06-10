'use client';

import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { getItemSeparationStatus } from '@/src/components/expedicao/shared/order-helpers';
import type { OrderDto, OrderItemDto } from '@/src/components/expedicao/shared/types';

export function SeparationItemRow(props: {
  order: OrderDto;
  item: OrderItemDto;
  onConfirmLine: (qty: number) => void | Promise<void>;
}) {
  const { order, item, onConfirmLine } = props;
  const [confirming, setConfirming] = useState(false);
  const [qtyDraft, setQtyDraft] = useState<number>(item.pickedQty ?? 0);
  const [checked, setChecked] = useState((item.pickedQty ?? 0) > 0);
  const st = getItemSeparationStatus(item);
  const editable = order.status === 'EM_SEPARACAO';
  const qtyClamped = useMemo(
    () => Math.max(0, Math.min(qtyDraft || 0, item.quantity)),
    [qtyDraft, item.quantity],
  );

  const statusClass =
    st.tone === 'complete'
      ? 'exp-item-badge--ok'
      : st.tone === 'partial'
        ? 'exp-item-badge--warn'
        : st.tone === 'nostock'
          ? 'exp-item-badge--late'
          : 'exp-item-badge--pending';

  return (
    <tr>
      <td className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px] text-[var(--exp-text-muted)]">
        {item.lineNumber}
      </td>
      <td className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px] font-semibold">
        {item.sku}
      </td>
      <td className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">
        {item.description}
      </td>
      <td className="overflow-hidden text-center text-ellipsis whitespace-nowrap font-mono font-semibold">
        {item.quantity}
      </td>
      <td className="overflow-hidden text-center text-ellipsis whitespace-nowrap">
        <input
          type="number"
          min={0}
          max={item.quantity}
          value={qtyDraft}
          disabled={!editable}
          onChange={(e) => setQtyDraft(Number(e.target.value))}
          className="exp-wb-qty-input"
        />
      </td>
      <td className="overflow-hidden px-[6px] py-[4px] text-center text-ellipsis whitespace-nowrap">
        <input
          type="checkbox"
          checked={checked}
          disabled={!editable}
          onChange={(e) => {
            const next = e.target.checked;
            setChecked(next);
            if (!next) {
              setQtyDraft(0);
              void onConfirmLine(0);
            }
          }}
          className="exp-wb-item-checkbox"
          aria-label={`Confirmar item ${item.lineNumber}`}
        />
      </td>
      <td className="overflow-hidden px-[6px] py-[4px] text-center text-ellipsis whitespace-nowrap">
        <button
          type="button"
          disabled={!editable || confirming || !checked}
          className="exp-wb-confirm-btn w-full px-[8px] py-[4px] text-[11px]"
          onClick={() => {
            setConfirming(true);
            void Promise.resolve(onConfirmLine(qtyClamped)).finally(() =>
              setConfirming(false),
            );
          }}
        >
          {confirming ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <span aria-hidden>✓</span>
          )}
          Confirmar
        </button>
      </td>
      <td className="overflow-hidden px-[6px] py-[4px] text-center text-ellipsis whitespace-nowrap">
        <span
          className={`exp-item-badge ${statusClass} inline-flex max-w-[80px] items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap text-[10px]`}
        >
          {st.label.toUpperCase()}
        </span>
      </td>
    </tr>
  );
}
