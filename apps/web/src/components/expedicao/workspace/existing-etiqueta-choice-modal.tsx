'use client';

import { Tag, Truck, X } from 'lucide-react';

export type ExistingEtiquetaChoice = 'emit-new' | 'exit-existing' | 'cancel';

export function ExistingEtiquetaChoiceModal(props: {
  open: boolean;
  trackingCode: string;
  busy?: boolean;
  onChoice: (choice: ExistingEtiquetaChoice) => void;
}) {
  const { open, trackingCode, busy = false, onChoice } = props;
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--color-overlay)] p-4">
      <div
        className="w-full max-w-md rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="existing-etiqueta-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3
              id="existing-etiqueta-title"
              className="text-base font-semibold text-[var(--text-primary)]"
            >
              Etiqueta já emitida
            </h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Este pedido já possui etiqueta com código{' '}
              <span className="font-mono font-semibold text-[var(--text-primary)]">
                {trackingCode}
              </span>
              .
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
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-card)] disabled:opacity-60"
            onClick={() => onChoice('emit-new')}
          >
            <Tag className="h-4 w-4" aria-hidden />
            Emitir nova
          </button>
          <button
            type="button"
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            onClick={() => onChoice('exit-existing')}
          >
            <Truck className="h-4 w-4" aria-hidden />
            Dar saída com etiqueta já emitida
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
