'use client';

import { useEffect, useState } from 'react';
import { Download, ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { fetchPurchaseDetail } from './compras-api';
import { ComprasDetailField, ComprasModalShell } from './compras-modal-shell';
import type { PurchaseRequest } from './compras-types';
import { TYPE_LABEL } from './compras-types';
import {
  displayName,
  displayQty,
  formatDate,
  formatDateTime,
  formatMoney,
} from './compras-utils';

export function ComprasDetailModal(props: {
  rowId: string;
  isAdmin: boolean;
  onClose: () => void;
  onAction: (action: 'comprado' | 'recusar', row: PurchaseRequest) => void;
  onDeleted: () => void;
}) {
  const [row, setRow] = useState<PurchaseRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloadingLogo, setDownloadingLogo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchPurchaseDetail(props.rowId)
      .then((detail) => {
        if (!cancelled) setRow(detail);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar detalhe.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.rowId]);

  const handleDelete = async () => {
    if (!row || !window.confirm('Excluir esta solicitação permanentemente?')) return;
    setDeleting(true);
    setError(null);
    try {
      await erpFetchJson(`api/compras/${row.id}`, { method: 'DELETE' });
      props.onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir solicitação.');
    } finally {
      setDeleting(false);
    }
  };

  const canResolve = row?.status === 'SOLICITADO';
  const logoSrc = row?.logoKey ? `/api/erp/compras/${row.id}/logo` : null;

  const handleOpenLogo = () => {
    if (!logoSrc) return;
    window.open(logoSrc, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadLogo = async () => {
    if (!logoSrc || !row) return;
    setDownloadingLogo(true);
    setError(null);
    try {
      const response = await fetch(logoSrc, { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Falha ao baixar logo.');
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = row.logoKey?.split('/').pop() ?? `logo-${row.id}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao baixar logo.');
    } finally {
      setDownloadingLogo(false);
    }
  };

  return (
    <ComprasModalShell title="Detalhe da Solicitação" onClose={props.onClose} size="lg">
      {loading ? (
        <div className="flex min-h-[12rem] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-300" />
        </div>
      ) : error && !row ? (
        <p className="text-sm text-rose-300">{error}</p>
      ) : row ? (
        <>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <ComprasDetailField label="Tipo" value={TYPE_LABEL[row.type]} />
            <ComprasDetailField label="Prioridade" value={row.priority} />
            <ComprasDetailField label="Fornecedor" value={row.supplierName ?? '—'} />
            <ComprasDetailField label="SKU" value={row.product?.sku ?? row.sku ?? '—'} />
            <ComprasDetailField label="Descrição" value={displayName(row)} wide />
            <ComprasDetailField label="Quantidade" value={String(displayQty(row))} />
            <ComprasDetailField label="Preço item" value={formatMoney(row.itemPrice)} />
            <ComprasDetailField label="Preço gravação" value={formatMoney(row.engravingPrice)} />
            <ComprasDetailField label="Entrega cliente" value={formatDate(row.clientDeadline)} />
            <ComprasDetailField label="Prevista chegada" value={formatDate(row.expectedArrival)} />
            <ComprasDetailField label="Link externo" value={row.link ?? '—'} wide />
            <ComprasDetailField label="Ref. pedido venda" value={row.saleOrderRef ?? '—'} />
            <ComprasDetailField label="Observação" value={row.observation ?? '—'} wide />
            <ComprasDetailField
              label="Responsável pela requisição"
              value={`${row.requestedBy.name} (${row.requestedBy.email})`}
              wide
            />
            <ComprasDetailField label="Valor compra" value={formatMoney(row.purchaseValue)} />
            <ComprasDetailField label="Resolvido em" value={formatDateTime(row.resolvedAt)} />
            <ComprasDetailField label="Motivo recusa" value={row.refusalReason ?? '—'} wide />
          </div>

          {logoSrc ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-white/70">Logo</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleOpenLogo}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Abrir imagem
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownloadLogo()}
                    disabled={downloadingLogo}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10 disabled:opacity-60"
                  >
                    {downloadingLogo ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    Download
                  </button>
                </div>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoSrc}
                alt="Logo da solicitação"
                className="mx-auto max-h-[200px] rounded-xl border border-white/10 object-contain"
              />
            </div>
          ) : null}

          {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}

          <div className="mt-5 flex flex-wrap justify-between gap-2">
            {props.isAdmin ? (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:opacity-60"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Excluir
              </button>
            ) : (
              <span />
            )}

            {canResolve ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => props.onAction('recusar', row)}
                  className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white"
                >
                  Recusar
                </button>
                <button
                  type="button"
                  onClick={() => props.onAction('comprado', row)}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white"
                >
                  Marcar Comprado
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </ComprasModalShell>
  );
}
