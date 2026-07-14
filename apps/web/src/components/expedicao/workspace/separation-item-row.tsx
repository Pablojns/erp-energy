'use client';

import { Loader2 } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
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

  const qtyInput = alreadyReceived ? (
    <span className="item-value text-[var(--text-muted)]">—</span>
  ) : (
    <input
      type="number"
      min={0}
      max={item.quantity}
      value={qtyDraft}
      disabled={!editable}
      onChange={(e) => setQtyDraft(Number(e.target.value))}
      className="exp-wb-qty-input qtd-sep-input item-value !min-h-0"
      aria-label="Qtd sep."
    />
  );

  const statusNode = alreadyReceived ? (
    <OrderItemReceiptStatusBadge
      status={item.mercadoEletronicoItemStatus ?? 'Recebido'}
    />
  ) : (
    <span
      className={`exp-wb-line-status exp-wb-line-status--${statusLabel.toLowerCase()} text-xs`}
    >
      {statusLabel}
    </span>
  );

  const actionNode = alreadyReceived ? (
    <span className="text-[10px] font-medium text-[var(--text-muted)]">Já recebido</span>
  ) : (
    <button
      type="button"
      disabled={!editable || confirming}
      className="exp-wb-confirm-btn btn-confirmar exp-wb-sep-checkbox disabled:cursor-not-allowed disabled:opacity-50"
      onClick={handleConfirm}
    >
      {confirming ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : 'Confirmar'}
    </button>
  );

  return (
    <Fragment>
      {/* Mobile — card em flex coluna (visível só &lt;768px via CSS) */}
      <tr className="exp-sep-mobile-card-row">
        <td colSpan={8}>
          <div className="item-card">
            <div className="item-row">
              <span className="item-linha">Linha</span>
              <span className="item-linha">{item.lineNumber}</span>
            </div>
            <div className="item-row">
              <span className="item-sku">{item.sku}</span>
              <span className="item-nome">{item.description}</span>
            </div>
            <div className="item-row">
              <span>
                <span className="item-label">Qtd: </span>
                <span className="item-value">
                  <OrderItemOrderedQtyCell qty={item.quantity} />
                </span>
              </span>
              {!hideStockColumn ? (
                <span>
                  <span className="item-label">Qtd Estoque: </span>
                  <span className="item-value">
                    <OrderItemStockQtyCell orderedQty={item.quantity} stock={stock} />
                  </span>
                </span>
              ) : null}
            </div>
            <div className="item-row item-row--stack">
              <span className="item-label">Qtd Sep.:</span>
              {qtyInput}
            </div>
            <div className="item-row">
              <span className="item-label">Status</span>
              {statusNode}
            </div>
            <div className="item-row item-row--action">{actionNode}</div>
          </div>
        </td>
      </tr>

      {/* Desktop — linha de tabela (visível ≥768px via CSS) */}
      <tr
        className={`exp-sep-desktop-row${alreadyReceived ? ' opacity-80' : ''}`}
      >
        <td className="exp-wb-cell-linha text-xs">{item.lineNumber}</td>
        <td className="exp-wb-cell-sku text-xs">{item.sku}</td>
        <td className="exp-wb-cell-item text-xs" title={item.description}>
          {item.description}
        </td>
        <td className="text-center">
          <OrderItemOrderedQtyCell qty={item.quantity} />
        </td>
        {!hideStockColumn ? (
          <td className="text-center">
            <OrderItemStockQtyCell orderedQty={item.quantity} stock={stock} />
          </td>
        ) : null}
        <td className="text-center">{qtyInput}</td>
        <td className="text-center">{statusNode}</td>
        <td className="text-center">{actionNode}</td>
      </tr>
    </Fragment>
  );
}
