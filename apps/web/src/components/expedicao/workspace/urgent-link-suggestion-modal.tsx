'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { pedidoApiUrl } from '@/src/services/api/pedidos-normalize';

export type VinculoSugestaoItem = {
  sku: string;
  description: string;
  baseQty: number;
  candidateQty: number;
  match: 'exact' | 'qty_diff' | 'only_base' | 'only_candidate';
};

export type VinculoSugestao = {
  orderId: string;
  displayNumber: string;
  source: string;
  status: string;
  customerDocument: string | null;
  deliveryCnpj: string | null;
  receiverName: string | null;
  totalValue: string;
  reasons: string[];
  score: number;
  skuOverlap: {
    matched: number;
    totalBase: number;
    totalCandidate: number;
    ratio: number;
  };
  valueDiffPct: number | null;
  items: VinculoSugestaoItem[];
};

export type VinculoSugestoesResponse = {
  role: 'urgent' | 'counterpart' | 'none';
  base?: {
    id: string;
    displayNumber: string;
    source: string;
    status: string;
    customerDocument: string | null;
    deliveryCnpj: string | null;
    receiverName: string | null;
    totalValue: string;
    items: Array<{ sku: string; description: string; quantity: number }>;
  };
  suggestions: VinculoSugestao[];
};

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function formatMoney(raw: string): string {
  const n = Number(raw);
  return money.format(Number.isFinite(n) ? n : 0);
}

function matchLabel(match: VinculoSugestaoItem['match']): string {
  switch (match) {
    case 'exact':
      return 'Igual';
    case 'qty_diff':
      return 'Qtd diferente';
    case 'only_base':
      return 'Só neste pedido';
    case 'only_candidate':
      return 'Só no candidato';
  }
}

export function UrgentLinkSuggestionModal(props: {
  numeroPed: string;
  baseLabel: string;
  suggestion: VinculoSugestao;
  baseTotalValue: string;
  baseReceiver: string | null;
  onClose: () => void;
  onConfirmed: () => void | Promise<void>;
  onDiscard: () => void;
  onError: (message: string) => void;
}) {
  const {
    numeroPed,
    baseLabel,
    suggestion,
    baseTotalValue,
    baseReceiver,
    onClose,
    onConfirmed,
    onDiscard,
    onError,
  } = props;
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    if (confirming) return;
    setConfirming(true);
    try {
      await erpFetchJson(pedidoApiUrl(numeroPed, 'confirmar-vinculo-urgente'), {
        method: 'POST',
        body: JSON.stringify({ candidateOrderId: suggestion.orderId }),
      });
      await onConfirmed();
      onClose();
    } catch (err) {
      onError(
        err instanceof Error
          ? err.message
          : 'Falha ao confirmar vínculo. Nenhuma alteração foi aplicada.',
      );
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              Revisar possível vínculo
            </h3>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Compare os pedidos lado a lado. O vínculo só acontece se você
              confirmar — nada é aplicado automaticamente.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]"
            onClick={onClose}
            aria-label="Fechar"
            disabled={confirming}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--border-color)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                Pedido atual
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                #{baseLabel}
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Recebedor: {baseReceiver?.trim() || '—'}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                Total: {formatMoney(baseTotalValue)}
              </p>
            </div>
            <div className="rounded-lg border border-amber-300/70 bg-amber-500/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Candidato sugerido
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                #{suggestion.displayNumber}
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Recebedor: {suggestion.receiverName?.trim() || '—'}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                Total: {formatMoney(suggestion.totalValue)}
              </p>
              <p className="mt-2 text-[11px] text-amber-800">
                {suggestion.reasons.join(' · ')}
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border-color)]">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <thead className="bg-[var(--bg-muted)] text-xs text-[var(--text-secondary)]">
                <tr>
                  <th className="px-2 py-1.5">SKU / Item</th>
                  <th className="px-2 py-1.5 text-center">Qtd atual</th>
                  <th className="px-2 py-1.5 text-center">Qtd candidato</th>
                  <th className="px-2 py-1.5">Comparação</th>
                </tr>
              </thead>
              <tbody>
                {suggestion.items.map((row) => (
                  <tr
                    key={row.sku}
                    className={`border-t border-[var(--border-color)] ${
                      row.match === 'exact'
                        ? ''
                        : row.match === 'qty_diff'
                          ? 'bg-amber-500/5'
                          : 'bg-rose-500/5'
                    }`}
                  >
                    <td className="px-2 py-1.5">
                      <span className="font-medium text-[var(--text-primary)]">
                        {row.sku}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-[var(--text-secondary)]">
                        {row.description}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-center tabular-nums">
                      {row.baseQty || '—'}
                    </td>
                    <td className="px-2 py-1.5 text-center tabular-nums">
                      {row.candidateQty || '—'}
                    </td>
                    <td className="px-2 py-1.5 text-xs">
                      {row.match === 'exact' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {matchLabel(row.match)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {matchLabel(row.match)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border-color)] px-4 py-3">
          <button
            type="button"
            className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]"
            onClick={onClose}
            disabled={confirming}
          >
            Fechar
          </button>
          <button
            type="button"
            className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            onClick={onDiscard}
            disabled={confirming}
          >
            Descartar sugestão
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--color-text-inverse)] disabled:opacity-60"
            onClick={() => void handleConfirm()}
            disabled={confirming}
          >
            {confirming ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Confirmando…
              </>
            ) : (
              'Confirmar vínculo'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
