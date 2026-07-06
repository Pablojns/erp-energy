'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { orderDisplayNumber } from '@/src/components/expedicao/shared/order-helpers';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { pedidoApiUrl } from '@/src/services/api/pedidos-normalize';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function formatCurrency(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return brl.format(Number.isFinite(n) ? n : 0);
}

export function DeleteOrderModal(props: {
  order: OrderDto | null;
  isOpen: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { order, isOpen, onClose, onDeleted } = props;
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setDeleting(false);
    }
  }, [isOpen]);

  if (!isOpen || !order) return null;

  const numero = orderDisplayNumber(order);
  const receiver = order.receiverName?.trim() || '—';
  const valor = formatCurrency(order.totalValue);
  const numeroPed = (order.externalOrderNumber || order.code).replace(/^#/, '');
  const canSubmit = Boolean(numeroPed);

  const handleClose = () => {
    if (deleting) return;
    setError(null);
    onClose();
  };

  const handleDelete = async () => {
    if (!canSubmit) {
      setError('Número do pedido inválido para exclusão.');
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await erpFetchJson(pedidoApiUrl(numeroPed!), { method: 'DELETE' });
      onDeleted();
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao excluir pedido.');
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
        aria-labelledby="delete-order-title"
      >
        <h2
          id="delete-order-title"
          className="text-lg font-semibold text-[var(--color-text-primary,var(--text-primary))]"
        >
          Excluir pedido
        </h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary,var(--text-secondary))]">
          Você está excluindo o pedido #{numero} — {receiver} — {valor}. Esta ação não
          pode ser desfeita. Confirmar?
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
            disabled={deleting || !canSubmit}
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
