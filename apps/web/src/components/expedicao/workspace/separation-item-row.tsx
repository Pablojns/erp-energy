'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { OrderDto, OrderItemDto } from '@/src/components/expedicao/shared/types';
import type { OrderItemStockState } from '@/src/components/expedicao/shared/use-order-items-stock';
import {
  OrderItemOrderedQtyCell,
  OrderItemStockQtyCell,
} from '@/src/components/expedicao/workspace/order-item-stock-cells';

function defaultSeparationQty(item: OrderItemDto): number {
  const picked = item.pickedQty ?? 0;
  return picked > 0 ? picked : item.quantity;
}

function lineStatusLabel(qty: number, ordered: number): string {
  if (qty <= 0) return 'PENDENTE';
  if (qty >= ordered) return 'COMPLETO';
  return 'PARCIAL';
}

export function SeparationItemRow(props: {
  order: OrderDto;
  item: OrderItemDto;
  stock: OrderItemStockState;
  onConfirmLine: (qty: number) => void | Promise<void>;
}) {
  const { order, item, stock, onConfirmLine } = props;
  const [confirming, setConfirming] = useState(false);
  const [qtyDraft, setQtyDraft] = useState<number>(() => defaultSeparationQty(item));
  const editable = order.status === 'EM_SEPARACAO';
  const qtyClamped = useMemo(
    () => Math.max(0, Math.min(qtyDraft || 0, item.quantity)),
    [qtyDraft, item.quantity],
  );
  const picked = item.pickedQty ?? 0;
  const statusLabel = lineStatusLabel(picked, item.quantity);

  useEffect(() => {
    setQtyDraft(defaultSeparationQty(item));
  }, [item.id, item.pickedQty, item.quantity]);

  const handleConfirm = () => {
    const qtyToSend = qtyClamped > 0 ? qtyClamped : item.quantity;
    setConfirming(true);
    void Promise.resolve(onConfirmLine(qtyToSend)).finally(() => setConfirming(false));
  };

  return (
    <tr>
      <td className="exp-wb-cell-linha text-xs">{item.lineNumber}</td>
      <td className="exp-wb-cell-sku text-xs">{item.sku}</td>
      <td className="exp-wb-cell-item text-xs" title={item.description}>
        {item.description}
      </td>
      <td className="text-center">
        <OrderItemOrderedQtyCell qty={item.quantity} />
      </td>
      <td className="text-center">
        <OrderItemStockQtyCell orderedQty={item.quantity} stock={stock} />
      </td>
      <td className="text-center">
        <input
          type="number"
          min={0}
          max={item.quantity}
          value={qtyDraft}
          disabled={!editable}
          onChange={(e) => setQtyDraft(Number(e.target.value))}
          className="exp-wb-qty-input !min-h-0 !py-1 !text-xs"
        />
      </td>
      <td className="text-center">
        <span
          className={`exp-wb-line-status exp-wb-line-status--${statusLabel.toLowerCase()} text-xs`}
        >
          {statusLabel}
        </span>
      </td>
      <td className="text-center">
        <button
          type="button"
          disabled={!editable || confirming}
          className="exp-wb-confirm-btn w-full !px-3 !py-1.5 !text-xs disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleConfirm}
        >
          {confirming ? (
            <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" />
          ) : (
            'Confirmar'
          )}
        </button>
      </td>
    </tr>
  );
}
