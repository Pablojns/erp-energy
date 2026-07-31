'use client';

import { CheckCircle2, Loader2, Truck, X } from 'lucide-react';

export type ItemRecebidoChoice = 'exit-item' | 'status-only' | 'cancel';

/** Pedido parcial: ao marcar a linha como Recebido, dá saída ou só muda status. */
export function ItemRecebidoChoiceModal(props: {
  open: boolean;
  sku: string;
  description?: string | null;
  quantity?: number;
  busy?: boolean;
  onChoice: (choice: ItemRecebidoChoice) => void;
}) {
  const {
    open,
    sku,
    description,
    quantity,
    busy = false,
    onChoice,
  } = props;
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[var(--color-overlay)] p-4">
      <div
        className="w-full max-w-md rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-recebido-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3
              id="item-recebido-title"
              className="text-base font-semibold text-[var(--text-primary)]"
            >
              Item marcado como Recebido
            </h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              <span className="font-mono font-semibold text-[var(--text-primary)]">
                {sku}
              </span>
              {description ? ` · ${description}` : ''}
              {quantity ? ` · ${quantity} un.` : ''}
            </p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              O que fazer com esta linha do pedido parcial?
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--input-bg)]"
            aria-label="Fechar"
            onClick={() => onChoice('cancel')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            onClick={() => onChoice('exit-item')}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Truck className="h-4 w-4" aria-hidden />
            )}
            Dar saída deste item
          </button>
          <p className="px-1 text-xs text-[var(--text-muted)]">
            Baixa o estoque da linha e registra a saída. O pedido segue parcial
            enquanto houver itens pendentes.
          </p>
          <button
            type="button"
            disabled={busy}
            className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-card)] disabled:opacity-60"
            onClick={() => onChoice('status-only')}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Apenas mudar status
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-60"
            onClick={() => onChoice('cancel')}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
