'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { isWegItemAlreadyReceived } from '@/src/components/expedicao/shared/order-helpers';
import type { OrderDto, OrderItemDto } from '@/src/components/expedicao/shared/types';
import type { OrderItemStockState } from '@/src/components/expedicao/shared/use-order-items-stock';
import { OrderItemReceiptStatusBadge } from '@/src/components/expedicao/workspace/order-item-receipt-status-badge';
import {
  OrderItemOrderedQtyCell,
  OrderItemStockQtyCell,
} from '@/src/components/expedicao/workspace/order-item-stock-cells';

function defaultSeparationQty(item: OrderItemDto): number {
  if (isWegItemAlreadyReceived(item)) return 0;
  return item.pickedQty ?? 0;
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
  hideStockColumn?: boolean;
  onConfirmLine: (qty: number) => void | Promise<void>;
}) {
  const { order, item, stock, hideStockColumn = false, onConfirmLine } = props;
  const alreadyReceived = isWegItemAlreadyReceived(item);
  const [confirming, setConfirming] = useState(false);
  const [qtyDraft, setQtyDraft] = useState<number>(() => defaultSeparationQty(item));
  const editable = order.status === 'EM_SEPARACAO' && !alreadyReceived;
  const qtyClamped = useMemo(
    () => Math.max(0, Math.min(qtyDraft || 0, item.quantity)),
    [qtyDraft, item.quantity],
  );
  const picked = item.pickedQty ?? 0;
  const statusLabel = alreadyReceived
    ? 'RECEBIDO'
    : lineStatusLabel(picked, item.quantity);

  useEffect(() => {
    setQtyDraft(defaultSeparationQty(item));
  }, [item.id, item.pickedQty, item.quantity, item.mercadoEletronicoItemStatus]);

  const handleConfirm = () => {
    if (alreadyReceived) return;
    setConfirming(true);
    void Promise.resolve(onConfirmLine(qtyClamped)).finally(() => setConfirming(false));
  };

  return (
    <tr className={alreadyReceived ? 'opacity-80' : undefined}>
      <td className="exp-wb-cell-linha text-xs" data-label="Linha">{item.lineNumber}</td>
      <td className="exp-wb-cell-sku text-xs" data-label="SKU">{item.sku}</td>
      <td className="exp-wb-cell-item text-xs" data-label="Item" title={item.description}>
        {item.description}
      </td>
      <td className="text-center" data-label="Qtd">
        <OrderItemOrderedQtyCell qty={item.quantity} />
      </td>
      <td className="text-center text-xs" data-label="Qtd Sep.">
        {alreadyReceived ? (
          <span className="text-[var(--text-muted)]">—</span>
        ) : (item.pickedQty ?? 0) > 0 ? (
          item.pickedQty
        ) : (
          '—'
        )}
      </td>
      {!hideStockColumn ? (
        <td className="text-center" data-label="Qtd Estoque">
          <OrderItemStockQtyCell orderedQty={item.quantity} stock={stock} />
        </td>
      ) : null}
      <td className="text-center" data-label="Qtd. separada">
        {alreadyReceived ? (
          <span className="text-xs text-[var(--text-muted)]">—</span>
        ) : (
          <input
            type="number"
            min={0}
            max={item.quantity}
            value={qtyDraft}
            disabled={!editable}
            onChange={(e) => setQtyDraft(Number(e.target.value))}
            className="exp-wb-qty-input !min-h-0 !py-1 !text-xs"
          />
        )}
      </td>
      <td className="text-center" data-label="Status">
        {alreadyReceived ? (
          <OrderItemReceiptStatusBadge
            status={item.mercadoEletronicoItemStatus ?? 'Recebido'}
          />
        ) : (
          <span
            className={`exp-wb-line-status exp-wb-line-status--${statusLabel.toLowerCase()} text-xs`}
          >
            {statusLabel}
          </span>
        )}
      </td>
      <td className="text-center" data-label="Ação">
        {alreadyReceived ? (
          <span className="text-[10px] font-medium text-[var(--text-muted)]">
            Já recebido
          </span>
        ) : (
          <button
            type="button"
            disabled={!editable || confirming}
            className="exp-wb-confirm-btn exp-wb-sep-checkbox w-full !min-h-[48px] !min-w-[48px] !px-3 !py-2.5 !text-sm disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleConfirm}
          >
            {confirming ? (
              <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" />
            ) : (
              'Confirmar'
            )}
          </button>
        )}
      </td>
    </tr>
  );
}
