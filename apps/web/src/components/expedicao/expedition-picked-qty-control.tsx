'use client';

import { Loader2, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

/** Estado local sincroniza com o servidor quando o pai remonta o controle (`key`). */

/** Subconjunto compatível com a serialização REST de item de pedido. */
export type ExpeditionOrderItemMini = {
  id: string;
  lineNumber?: number;
  quantity: number;
  pickedQty?: number;
};

export function ExpeditionPickedQtyControl(props: {
  orderId: string;
  /** Quando informado, usa PATCH /api/pedidos/:numeroPed/itens/:seq */
  numeroPed?: number | null;
  item: ExpeditionOrderItemMini;
  disabled: boolean;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const { orderId, numeroPed, item, disabled, onSaved, onError } = props;
  const [local, setLocal] = useState(item.pickedQty ?? 0);
  const [saving, setSaving] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = useCallback(
    async (next: number) => {
      const cap = item.quantity;
      const v = Math.max(0, Math.min(Math.round(next), cap));
      setLocal(v);
      setSaving(true);
      try {
        if (numeroPed && item.lineNumber !== undefined) {
          await erpFetchJson(
            `api/pedidos/${numeroPed}/itens/${item.lineNumber}`,
            {
              method: 'PATCH',
              body: JSON.stringify({ quantidade_separada: v }),
            },
          );
        } else {
          await erpFetchJson<{ id: string }>(
            `orders/${orderId}/items/${item.id}/picked-qty`,
            {
              method: 'PATCH',
              body: JSON.stringify({ pickedQty: v }),
            },
          );
        }
        onSaved();
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Falha ao salvar separação.');
      } finally {
        setSaving(false);
      }
    },
    [item.id, item.lineNumber, item.quantity, numeroPed, orderId, onError, onSaved],
  );

  const schedule = (v: number) => {
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(() => void commit(v), 380);
  };

  useEffect(
    () => () => {
      if (tRef.current) clearTimeout(tRef.current);
    },
    [],
  );

  return (
    <div className="exp-premium-qty">
      <button
        type="button"
        disabled={disabled || saving}
        className="erp-qty-btn"
        onClick={() => {
          const n = Math.max(0, local - 1);
          setLocal(n);
          schedule(n);
        }}
        aria-label="Diminuir quantidade separada"
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="number"
        min={0}
        max={item.quantity}
        value={local}
        disabled={disabled || saving}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isNaN(n)) return;
          const c = Math.max(0, Math.min(Math.round(n), item.quantity));
          setLocal(c);
          schedule(c);
        }}
        className="erp-qty-input"
      />
      <button
        type="button"
        disabled={disabled || saving || local >= item.quantity}
        className="erp-qty-btn"
        onClick={() => {
          const n = Math.min(item.quantity, local + 1);
          setLocal(n);
          schedule(n);
        }}
        aria-label="Aumentar quantidade separada"
      >
        <Plus className="h-4 w-4" />
      </button>
      {saving ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--erp-success)]" />
      ) : null}
    </div>
  );
}
