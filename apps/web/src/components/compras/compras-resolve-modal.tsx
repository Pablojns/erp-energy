'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { ComprasModalShell } from './compras-modal-shell';
import type { PurchaseRequest } from './compras-types';
import { displayName, fieldClass } from './compras-utils';

export function ComprasResolveModal(props: {
  row: PurchaseRequest;
  action: 'comprado' | 'recusar';
  onClose: () => void;
  onResolved: () => void;
}) {
  const { row, action, onClose, onResolved } = props;
  const [purchaseValue, setPurchaseValue] = useState('');
  const [refusalReason, setRefusalReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (action === 'recusar' && !refusalReason.trim()) {
      setError('Informe o motivo da recusa.');
      return;
    }
    setSaving(true);
    try {
      await erpFetchJson(`api/compras/${row.id}/${action}`, {
        method: 'PATCH',
        body: JSON.stringify(
          action === 'comprado'
            ? { purchaseValue: purchaseValue ? Number(purchaseValue) : undefined }
            : { refusalReason: refusalReason.trim() },
        ),
      });
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao resolver solicitação.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ComprasModalShell
      title={action === 'comprado' ? 'Marcar Comprado' : 'Recusar Solicitação'}
      onClose={onClose}
      size="sm"
    >
      <p className="mb-4 text-sm text-gray-600">{displayName(row)}</p>
      {action === 'comprado' ? (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-600">
            Valor de compra (opcional)
          </span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={purchaseValue}
            onChange={(e) => setPurchaseValue(e.target.value)}
            className={fieldClass()}
            placeholder="0,00"
          />
        </label>
      ) : (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-600">Motivo da recusa</span>
          <textarea
            value={refusalReason}
            onChange={(e) => setRefusalReason(e.target.value)}
            className={`${fieldClass(Boolean(error))} min-h-28 resize-none`}
            placeholder="Explique o motivo..."
          />
        </label>
      )}
      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className="inline-flex items-center gap-2 erp-focus-ring erp-btn erp-btn-primary erp-btn--md disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Confirmar
        </button>
      </div>
    </ComprasModalShell>
  );
}
