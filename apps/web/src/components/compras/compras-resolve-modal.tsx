'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { updatePurchaseStatus } from './compras-api';
import { ComprasModalShell } from './compras-modal-shell';
import type { PurchaseRequest, PurchaseStage } from './compras-types';
import { displayName, fieldClass } from './compras-utils';

/**
 * Popup de confirmação de movimento.
 *
 * Dois modos:
 * - `action`: modo legado dos botões do detalhe (endpoints /comprado e /recusar).
 * - `stage`: movimento para uma etapa que pede valor/data (requiresPurchaseDetails)
 *   e/ou motivo (requiresReason).
 */
export function ComprasResolveModal(props: {
  row: PurchaseRequest;
  action?: 'comprado' | 'recusar';
  stage?: PurchaseStage;
  onClose: () => void;
  onResolved: (updated?: PurchaseRequest) => void;
}) {
  const { row, action, stage, onClose, onResolved } = props;
  const [purchaseValue, setPurchaseValue] = useState('');
  const [purchasedAt, setPurchasedAt] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [refusalReason, setRefusalReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsPurchaseDetails = stage
    ? stage.requiresPurchaseDetails
    : action === 'comprado';
  const needsReason = stage ? stage.requiresReason : action === 'recusar';

  const title = stage
    ? `Mover para ${stage.name}`
    : action === 'comprado'
      ? 'Aprovar Requisição'
      : 'Recusar Solicitação';

  const submit = async () => {
    setError(null);
    if (needsReason && !refusalReason.trim()) {
      setError('Informe o motivo.');
      return;
    }
    setSaving(true);
    try {
      if (stage) {
        const updated = await updatePurchaseStatus(row.id, stage.id, {
          ...(needsPurchaseDetails && purchaseValue
            ? { purchaseValue: Number(purchaseValue) }
            : {}),
          ...(needsPurchaseDetails && purchasedAt
            ? { purchasedAt: new Date(purchasedAt).toISOString() }
            : {}),
          ...(needsReason ? { refusalReason: refusalReason.trim() } : {}),
        });
        onResolved(updated);
        return;
      }

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
    <ComprasModalShell title={title} onClose={onClose} size="sm">
      <p className="mb-4 text-sm text-gray-600">{displayName(row)}</p>

      {needsPurchaseDetails ? (
        <div className="space-y-3">
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
          {stage ? (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-600">
                Data da compra
              </span>
              <input
                type="date"
                value={purchasedAt}
                onChange={(e) => setPurchasedAt(e.target.value)}
                className={fieldClass()}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {needsReason ? (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-600">Motivo</span>
          <textarea
            value={refusalReason}
            onChange={(e) => setRefusalReason(e.target.value)}
            className={`${fieldClass(Boolean(error))} min-h-28 resize-none`}
            placeholder="Explique o motivo..."
          />
        </label>
      ) : null}

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
