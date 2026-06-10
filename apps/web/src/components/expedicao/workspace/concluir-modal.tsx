'use client';

import { useState } from 'react';

export function ConcluirModal(props: {
  orderNumber: string;
  customerName: string | null;
  complete: number;
  partial: number;
  pending: number;
  finalStatus: 'PARCIAL' | 'COMPLETO';
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const { orderNumber, customerName, complete, partial, pending, finalStatus, loading, onCancel, onConfirm } = props;
  const [step, setStep] = useState<1 | 2>(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="w-full max-w-xl rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Concluir separação</h3>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm text-[var(--text-secondary)] hover:bg-[var(--input-bg)]"
            onClick={onCancel}
            disabled={loading}
          >
            X
          </button>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <p className="text-[var(--text-primary)]">Pedido #{orderNumber}</p>
          <p className="text-[var(--text-secondary)]">
            Cliente: {customerName?.trim() || 'Não informado'}
          </p>
        </div>

        {step === 1 ? (
          <div className="mt-4 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] p-3 text-sm text-[var(--text-secondary)]">
            Deseja confirmar a conclusão desta separação?
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] p-3 text-sm">
            <p className="font-semibold text-[var(--text-primary)]">Resumo:</p>
            <p className="mt-2 text-[var(--text-primary)]">✓ Itens completos: {complete}</p>
            <p className={`text-[var(--text-primary)] ${partial > 0 ? 'font-semibold text-amber-500' : ''}`}>
              ~ Itens parciais: {partial}
            </p>
            <p className="text-[var(--text-primary)]">○ Itens pendentes: {pending}</p>
            <p className="mt-3 text-[var(--text-secondary)]">
              Status final:{' '}
              <span className="inline-flex rounded-full border border-[var(--border-color)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-primary)]">
                {finalStatus}
              </span>
            </p>
            {partial > 0 ? (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">
                Itens parciais serão registrados nas observações do pedido.
              </p>
            ) : null}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          {step === 1 ? (
            <>
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
                className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                onClick={() => setStep(2)}
                disabled={loading}
              >
                Confirmar →
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]"
                onClick={() => setStep(1)}
                disabled={loading}
              >
                ← Voltar
              </button>
              <button
                type="button"
                className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={loading}
                onClick={() => void onConfirm()}
              >
                {loading ? 'Concluindo...' : 'Confirmar e concluir'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

