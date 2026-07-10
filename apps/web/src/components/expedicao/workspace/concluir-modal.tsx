'use client';

import { isWegItemAlreadyReceived } from '@/src/components/expedicao/shared/order-helpers';
import type { OrderDto, OrderItemDto } from '@/src/components/expedicao/shared/types';

export function ConcluirModal(props: {
  orderNumber: string;
  receiverName: string | null;
  items: OrderItemDto[];
  complete: number;
  partial: number;
  pending: number;
  finalStatus: 'PARCIAL' | 'COMPLETO';
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const {
    orderNumber,
    receiverName,
    items,
    complete,
    partial,
    pending,
    finalStatus,
    loading,
    onCancel,
    onConfirm,
  } = props;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay)] p-4">
      <div
        className="w-full max-w-xl rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        <h3 className="text-base font-semibold text-[var(--text-primary)]">
          Concluir Separação — Pedido #{orderNumber}
        </h3>

        <div className="mt-3 space-y-1 text-sm">
          <p className="text-[var(--text-primary)]">
            <span className="text-[var(--text-secondary)]">Pedido:</span> #{orderNumber}
          </p>
          <p className="text-[var(--text-primary)]">
            <span className="text-[var(--text-secondary)]">Recebedor:</span>{' '}
            {receiverName?.trim() || 'Não informado'}
          </p>
        </div>

        <div className="mt-4 space-y-3 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] p-3">
          {items.some((item) => (item.pickedQty ?? 0) > 0) ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                Itens neste lote
              </p>
              <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto text-sm">
                {items
                  .filter((item) => (item.pickedQty ?? 0) > 0)
                  .map((item) => {
                    const picked = item.pickedQty ?? 0;
                    const lineStatus =
                      picked >= item.quantity ? 'completo' : 'parcial';
                    return (
                      <li
                        key={item.id}
                        className="flex items-start justify-between gap-3 text-[var(--text-primary)]"
                      >
                        <span className="min-w-0 flex-1 truncate" title={item.description}>
                          {item.description}
                        </span>
                        <span
                          className={`shrink-0 font-medium tabular-nums ${
                            lineStatus === 'parcial' ? 'text-amber-500' : ''
                          }`}
                        >
                          {picked} / {item.quantity}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ) : null}

          {items.some(
            (item) => !isWegItemAlreadyReceived(item) && (item.pickedQty ?? 0) === 0,
          ) ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                Itens pendentes (não vão neste lote)
              </p>
              <ul className="mt-2 max-h-32 space-y-1.5 overflow-y-auto text-sm text-[var(--text-secondary)]">
                {items
                  .filter(
                    (item) =>
                      !isWegItemAlreadyReceived(item) && (item.pickedQty ?? 0) === 0,
                  )
                  .map((item) => (
                    <li key={item.id} className="truncate" title={item.description}>
                      {item.description} — 0 / {item.quantity}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="mt-4 space-y-1 text-sm text-[var(--text-primary)]">
          <p>✓ Itens completos: {complete}</p>
          <p className={partial > 0 ? 'font-semibold text-amber-500' : ''}>
            ~ Itens parciais: {partial}
          </p>
          <p className={pending > 0 ? 'font-semibold text-[var(--text-secondary)]' : ''}>
            ○ Itens pendentes: {pending}
          </p>
          <p className="pt-2 text-[var(--text-secondary)]">
            Status final:{' '}
            <span className="inline-flex rounded-full border border-[var(--border-color)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-primary)]">
              {finalStatus}
            </span>
          </p>
          {finalStatus === 'PARCIAL' ? (
            <p className="text-xs text-amber-600 dark:text-amber-300">
              Este lote é parcial. Itens pendentes ou com quantidade incompleta
              permanecem no pedido para envio futuro e aparecem no filtro Parcial.
            </p>
          ) : null}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]"
            onClick={onCancel}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--color-text-inverse)] disabled:opacity-60"
            disabled={loading}
            onClick={() => void onConfirm()}
          >
            {loading ? 'Concluindo…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
