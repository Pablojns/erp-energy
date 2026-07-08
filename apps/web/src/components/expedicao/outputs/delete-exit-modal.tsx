'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { formatBrlDisplay } from '@/src/components/expedicao/expedition-wms-layout';
import type { OrderExitDto } from '@/src/components/expedicao/shared/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

function formatOrderNumber(exitItem: OrderExitDto): string {
  return exitItem.order.externalOrderNumber?.trim()
    ? `#${exitItem.order.externalOrderNumber}`
    : exitItem.order.code;
}

export function DeleteExitModal(props: {
  exit: OrderExitDto | null;
  isOpen: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { exit, isOpen, onClose, onDeleted } = props;
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setDeleting(false);
    }
  }, [isOpen]);

  if (!isOpen || !exit) return null;

  const numero = formatOrderNumber(exit);
  const nf = exit.invoiceNumber?.trim() || '—';
  const valor = formatBrlDisplay(exit.invoiceValue);

  const handleClose = () => {
    if (deleting) return;
    setError(null);
    onClose();
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await erpFetchJson(`api/pedidos/saidas/${exit.id}`, { method: 'DELETE' });
      onDeleted();
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao excluir saída.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[var(--color-overlay)]"
        aria-label="Fechar"
        onClick={handleClose}
        disabled={deleting}
      />
      <div
        className="relative w-full max-w-md rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3 shadow-xl sm:p-6"
        role="dialog"
        aria-labelledby="delete-exit-title"
      >
        <h2
          id="delete-exit-title"
          className="text-lg font-semibold text-[var(--color-text-primary,var(--text-primary))]"
        >
          Excluir saída
        </h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary,var(--text-secondary))]">
          Você está excluindo a saída do pedido {numero} — NF {nf} — {valor}. O pedido
          voltará para expedição e o estoque será restaurado se houver movimentação
          registrada. Confirmar?
        </p>
        {error ? <p className="mt-3 text-sm text-rose-500">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary,var(--text-secondary))]"
            onClick={handleClose}
            disabled={deleting}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-[var(--color-text-inverse)] disabled:opacity-60"
            onClick={() => void handleDelete()}
            disabled={deleting}
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
