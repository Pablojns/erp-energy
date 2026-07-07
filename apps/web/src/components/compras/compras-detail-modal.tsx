'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Download, Loader2, Save, Trash2, X } from 'lucide-react';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { fetchPurchaseDetail } from './compras-api';
import { ComprasDetailField, ComprasModalShell } from './compras-modal-shell';
import type { PurchaseRequest, PurchaseRequestImage } from './compras-types';
import { TYPE_LABEL } from './compras-types';
import {
  calcPurchaseTotalFromRow,
  displayName,
  displayQty,
  fieldClass,
  formatDate,
  formatDateTime,
  formatMoney,
  formatMoneyNumber,
  purchaseImageSrc,
} from './compras-utils';

const OBSERVATION_URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/g;

function renderObservationWithLinks(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(OBSERVATION_URL_PATTERN)) {
    const url = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index));
    }
    nodes.push(
      <a
        key={`${index}-${url}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-indigo-300 underline hover:text-indigo-200"
      >
        {url}
      </a>,
    );
    lastIndex = index + url.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

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
  const [downloadingImageId, setDownloadingImageId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<PurchaseRequestImage | null>(null);
  const [expectedArrival, setExpectedArrival] = useState('');
  const [savingArrival, setSavingArrival] = useState(false);
  const [quantityInput, setQuantityInput] = useState('');
  const [savingQuantity, setSavingQuantity] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchPurchaseDetail(props.rowId)
      .then((detail) => {
        if (!cancelled) {
          setRow(detail);
          setExpectedArrival(
            detail.expectedArrival ? detail.expectedArrival.slice(0, 10) : '',
          );
          setQuantityInput(String(displayQty(detail)));
        }
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
  const isWeg = row?.type === 'WEG_CONTRATO';
  const canEditQuantity =
    row != null && row.status !== 'COMPRADO' && row.status !== 'RECUSADO';
  const calculatedTotal = row ? calcPurchaseTotalFromRow(row) : null;

  const handleDownloadImage = async (image: PurchaseRequestImage) => {
    if (!row) return;
    const src = purchaseImageSrc(row.id, image.id);
    setDownloadingImageId(image.id);
    setError(null);
    try {
      const response = await fetch(src, { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Falha ao baixar imagem.');
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = image.imageKey.split('/').pop() ?? `imagem-${image.id}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao baixar imagem.');
    } finally {
      setDownloadingImageId(null);
    }
  };

  const handleSaveArrival = async () => {
    if (!row || !expectedArrival) return;
    setSavingArrival(true);
    setError(null);
    try {
      const updated = await erpFetchJson<PurchaseRequest>(`api/compras/${row.id}/chegada`, {
        method: 'PATCH',
        body: JSON.stringify({ expectedArrival }),
      });
      setRow(updated);
      setExpectedArrival(
        updated.expectedArrival ? updated.expectedArrival.slice(0, 10) : '',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar data prevista.');
    } finally {
      setSavingArrival(false);
    }
  };

  const handleSaveQuantity = async () => {
    if (!row) return;
    const nextQty = Number(quantityInput);
    if (!Number.isInteger(nextQty) || nextQty < 1) {
      setError('Informe uma quantidade válida (mínimo 1).');
      return;
    }

    setSavingQuantity(true);
    setError(null);
    try {
      const updated = await erpFetchJson<PurchaseRequest>(`api/compras/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify(
          isWeg ? { suggestedQty: nextQty } : { quantity: nextQty },
        ),
      });
      setRow(updated);
      setQuantityInput(String(displayQty(updated)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar quantidade.');
    } finally {
      setSavingQuantity(false);
    }
  };

  return (
    <>
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
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-white/40">Fornecedor</p>
                <p className="mt-1 break-words rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white">
                  {row.supplierName?.trim()
                    ? renderObservationWithLinks(row.supplierName)
                    : '—'}
                </p>
              </div>
              <ComprasDetailField label="SKU" value={row.product?.sku ?? row.sku ?? '—'} />
              <ComprasDetailField label="Descrição" value={displayName(row)} wide />
              {canEditQuantity ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-white/40">
                    Quantidade
                  </p>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="number"
                      min={1}
                      value={quantityInput}
                      onChange={(e) => setQuantityInput(e.target.value)}
                      className={fieldClass()}
                    />
                    <button
                      type="button"
                      onClick={() => void handleSaveQuantity()}
                      disabled={savingQuantity || !quantityInput}
                      className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-indigo-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {savingQuantity ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Salvar
                    </button>
                  </div>
                </div>
              ) : (
                <ComprasDetailField label="Quantidade" value={String(displayQty(row))} />
              )}
              <ComprasDetailField label="Preço item" value={formatMoney(row.itemPrice)} />
              <ComprasDetailField label="Total" value={formatMoneyNumber(calculatedTotal)} />
              {!isWeg ? (
                <ComprasDetailField
                  label="Preço gravação"
                  value={formatMoney(row.engravingPrice)}
                />
              ) : null}
              <ComprasDetailField label="Entrega cliente" value={formatDate(row.clientDeadline)} />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-white/40">
                  Data prevista chegada
                </p>
                <div className="mt-1 flex gap-2">
                  <input
                    type="date"
                    value={expectedArrival}
                    onChange={(e) => setExpectedArrival(e.target.value)}
                    className={fieldClass()}
                  />
                  <button
                    type="button"
                    onClick={() => void handleSaveArrival()}
                    disabled={savingArrival || !expectedArrival}
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-indigo-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {savingArrival ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Salvar
                  </button>
                </div>
              </div>
              <ComprasDetailField label="Link externo" value={row.link ?? '—'} wide />
              {!isWeg ? (
                <ComprasDetailField label="Ref. pedido venda" value={row.saleOrderRef ?? '—'} />
              ) : null}
              <div className="sm:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-white/40">Observação</p>
                <p className="mt-1 whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white">
                  {row.observation?.trim()
                    ? renderObservationWithLinks(row.observation)
                    : '—'}
                </p>
              </div>
              <ComprasDetailField
                label="Responsável pela requisição"
                value={`${row.requestedBy.name} (${row.requestedBy.email})`}
                wide
              />
              <ComprasDetailField label="Valor compra" value={formatMoney(row.purchaseValue)} />
              <ComprasDetailField label="Resolvido em" value={formatDateTime(row.resolvedAt)} />
              <ComprasDetailField label="Motivo recusa" value={row.refusalReason ?? '—'} wide />
            </div>

            {row.images.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="mb-3 text-sm font-medium text-white/70">Imagens</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {row.images.map((image) => {
                    const src = purchaseImageSrc(row.id, image.id);
                    return (
                      <div
                        key={image.id}
                        className="overflow-hidden rounded-xl border border-white/10 bg-black/30"
                      >
                        <button
                          type="button"
                          onClick={() => setLightboxImage(image)}
                          className="block w-full"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={src}
                            alt="Imagem da solicitação"
                            className="h-28 w-full object-cover transition hover:opacity-90"
                          />
                        </button>
                        <div className="p-2">
                          <button
                            type="button"
                            onClick={() => void handleDownloadImage(image)}
                            disabled={downloadingImageId === image.id}
                            className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] font-semibold text-white transition hover:bg-white/10 disabled:opacity-60"
                          >
                            {downloadingImageId === image.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Download className="h-3 w-3" />
                            )}
                            Download
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
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

      {lightboxImage && row ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/80"
            onClick={() => setLightboxImage(null)}
            aria-label="Fechar visualização"
          />
          <div className="relative max-h-[90vh] max-w-4xl">
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="absolute -right-2 -top-2 z-10 rounded-full bg-black/80 p-2 text-white"
            >
              <X className="h-5 w-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={purchaseImageSrc(row.id, lightboxImage.id)}
              alt="Visualização ampliada"
              className="max-h-[85vh] max-w-full rounded-2xl border border-white/10 object-contain"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
