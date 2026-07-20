'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Download, Loader2, Save, Trash2, Upload, X } from 'lucide-react';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import {
  erpFetchFormData,
  fetchPurchaseDetail,
  updatePurchaseStatus,
} from './compras-api';
import { ComprasModalShell } from './compras-modal-shell';
import { ComprasStageActions } from './compras-stage-actions';
import type { PurchaseRequest, PurchaseRequestImage } from './compras-types';
import { KANBAN_COLUMNS } from './compras-types';
import {
  calcEngravingTotalFromRow,
  calcPurchaseTotalFromRow,
  displayName,
  displayQty,
  displaySupplierName,
  fieldClass,
  formatMoney,
  formatMoneyNumber,
  kanbanColumnForStatus,
  purchaseUnitPrice,
  purchaseImageSrc,
} from './compras-utils';
import { formatDeliveryAddressDisplay } from '@/src/components/cadastros/delivery-address';
import { MobileEtapaSelect } from '@/src/components/mobile/mobile-etapa-select';
import { useIsMobileKanban } from '@/src/hooks/use-is-mobile-kanban';

const OBSERVATION_URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/g;

function engravingNameFromRow(row: PurchaseRequest) {
  if (row.engravingName?.trim()) return row.engravingName.trim();
  const match = row.observation?.match(/Gravação:\s*([^|\n]+)/i);
  return match?.[1]?.trim() || null;
}

/** Remove texto automático gerado na aprovação do orçamento; mantém observação manual. */
function manualObservationText(raw: string | null | undefined) {
  if (!raw?.trim()) return '';
  const parts = raw
    .split(/\s*\|\s*|\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter(
      (part) =>
        !/^Origem:\s*orçamento\b/i.test(part) &&
        !/^Gravação:\s*/i.test(part) &&
        !/^Total item\b/i.test(part),
    );
  return parts.join(' | ');
}

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
        className="text-indigo-600 underline hover:text-indigo-700"
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

function formatQuoteCodeDisplay(code: string | null | undefined) {
  if (!code?.trim()) return null;
  return code.trim().replace(/^ORC-/i, 'ORÇ-');
}

export function ComprasDetailModal(props: {
  rowId: string;
  isAdmin: boolean;
  onClose: () => void;
  onAction: (action: 'comprado' | 'recusar', row: PurchaseRequest) => void;
  onDeleted: () => void;
  onStatusChanged?: (updated: PurchaseRequest) => void;
}) {
  const isMobile = useIsMobileKanban();
  const logoInputRef = useRef<HTMLInputElement>(null);
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
  const [itemPriceInput, setItemPriceInput] = useState('');
  const [savingItemPrice, setSavingItemPrice] = useState(false);
  const [priority, setPriority] = useState<'NORMAL' | 'URGENTE'>('NORMAL');
  const [savingPriority, setSavingPriority] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [savingLink, setSavingLink] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingImageId, setRemovingImageId] = useState<string | null>(null);
  const [movingEtapa, setMovingEtapa] = useState(false);

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
          setItemPriceInput(purchaseUnitPrice(detail) || '');
          setPriority(detail.priority === 'URGENTE' ? 'URGENTE' : 'NORMAL');
          setLinkInput(detail.link ?? '');
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
  const canEditOpenRequest =
    row != null && row.status !== 'COMPRADO' && row.status !== 'RECUSADO';

  const liveTotal = useMemo(() => {
    const qty = Number(quantityInput);
    const price = Number(String(itemPriceInput).replace(',', '.'));
    if (!Number.isFinite(qty) || qty < 1 || !Number.isFinite(price) || price < 0) {
      return row ? calcPurchaseTotalFromRow(row) : null;
    }
    return qty * price;
  }, [quantityInput, itemPriceInput, row]);

  const liveEngravingTotal = useMemo(() => {
    if (!row) return null;
    const qty = Number(quantityInput);
    const unit = Number(String(row.engravingPrice ?? '').replace(',', '.'));
    if (Number.isFinite(qty) && qty >= 1 && Number.isFinite(unit) && unit >= 0) {
      return qty * unit;
    }
    return calcEngravingTotalFromRow(row);
  }, [quantityInput, row]);

  const quoteCodeDisplay = formatQuoteCodeDisplay(row?.saleOrderRef);
  const observationText = manualObservationText(row?.observation);
  const engravingTechnique = row ? engravingNameFromRow(row) : null;
  const addressDisplay = formatDeliveryAddressDisplay(row?.deliveryAddress);

  const handleDownloadImage = async (image: PurchaseRequestImage) => {
    if (!row) return;
    const src = purchaseImageSrc(row.id, image.id, image.url);
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
      setItemPriceInput(purchaseUnitPrice(updated) || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar quantidade.');
    } finally {
      setSavingQuantity(false);
    }
  };

  const handleSaveItemPrice = async () => {
    if (!row) return;
    const nextPrice = Number(String(itemPriceInput).replace(',', '.'));
    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      setError('Informe um preço de item válido.');
      return;
    }

    setSavingItemPrice(true);
    setError(null);
    try {
      const updated = await erpFetchJson<PurchaseRequest>(`api/compras/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ itemPrice: nextPrice }),
      });
      setRow(updated);
      setItemPriceInput(purchaseUnitPrice(updated) || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar preço do item.');
    } finally {
      setSavingItemPrice(false);
    }
  };

  const handleSavePriority = async (next: 'NORMAL' | 'URGENTE') => {
    if (!row || next === priority) return;
    setPriority(next);
    setSavingPriority(true);
    setError(null);
    try {
      const updated = await erpFetchJson<PurchaseRequest>(`api/compras/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ priority: next }),
      });
      setRow(updated);
      setPriority(updated.priority === 'URGENTE' ? 'URGENTE' : 'NORMAL');
    } catch (err) {
      setPriority(row.priority === 'URGENTE' ? 'URGENTE' : 'NORMAL');
      setError(err instanceof Error ? err.message : 'Falha ao salvar prioridade.');
    } finally {
      setSavingPriority(false);
    }
  };

  const handleSaveLink = async () => {
    if (!row) return;
    setSavingLink(true);
    setError(null);
    try {
      const updated = await erpFetchJson<PurchaseRequest>(`api/compras/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ link: linkInput.trim() || null }),
      });
      setRow(updated);
      setLinkInput(updated.link ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar link externo.');
    } finally {
      setSavingLink(false);
    }
  };

  const handleUploadLogo = async (files: FileList | null) => {
    if (!row || !files?.length) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append('images', file));
      const updated = await erpFetchFormData<PurchaseRequest>(
        `api/compras/${row.id}/imagens`,
        formData,
      );
      setRow(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async (image: PurchaseRequestImage) => {
    if (!row) return;
    setRemovingImageId(image.id);
    setError(null);
    try {
      const updated = await erpFetchJson<PurchaseRequest>(
        `api/compras/${row.id}/imagens/${image.id}`,
        { method: 'DELETE' },
      );
      setRow(updated);
      if (lightboxImage?.id === image.id) {
        setLightboxImage(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover logo.');
    } finally {
      setRemovingImageId(null);
    }
  };

  const currentEtapa = row ? kanbanColumnForStatus(row.status) : null;

  const handleEtapaConfirm = async (nextEtapa: string) => {
    if (!row || nextEtapa === currentEtapa) return;
    setMovingEtapa(true);
    setError(null);
    try {
      const updated = await updatePurchaseStatus(row.id, nextEtapa);
      setRow(updated);
      props.onStatusChanged?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao mudar etapa.');
    } finally {
      setMovingEtapa(false);
    }
  };

  return (
    <>
      <ComprasModalShell
        title={isMobile ? 'Detalhes' : 'Detalhe da Solicitação'}
        onClose={props.onClose}
        size="lg"
      >
        {loading ? (
          <div className="flex min-h-[12rem] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : error && !row ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : row ? (
          <>
            {isMobile ? (
              <div className="mb-4">
                <MobileEtapaSelect
                  label="Etapa atual"
                  currentValue={currentEtapa ?? ''}
                  options={KANBAN_COLUMNS.filter(
                    (column) =>
                      column.id !== 'RECUSADO' || currentEtapa === 'RECUSADO',
                  ).map((column) => ({
                    id: column.id,
                    label: column.label,
                  }))}
                  disabled={!currentEtapa || currentEtapa === 'RECUSADO'}
                  saving={movingEtapa}
                  emptyLabel="Sem etapa no Kanban"
                  onConfirm={handleEtapaConfirm}
                />
              </div>
            ) : null}

            {/* Header */}
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-4">
              <div className="min-w-0">
                {quoteCodeDisplay ? (
                  <p className="text-2xl font-bold tracking-tight text-[#2AACE2]">
                    {quoteCodeDisplay}
                  </p>
                ) : (
                  <p className="text-sm text-gray-500">Sem orçamento vinculado</p>
                )}
                <p className="mt-1 text-base font-semibold text-gray-900">
                  {row.customerName?.trim() || '—'}
                </p>
              </div>
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                Prioridade
                <select
                  value={priority}
                  disabled={!canEditOpenRequest || savingPriority}
                  onChange={(e) =>
                    void handleSavePriority(e.target.value as 'NORMAL' | 'URGENTE')
                  }
                  className={`${fieldClass()} mt-1 min-w-[8rem]`}
                >
                  <option value="NORMAL">Normal</option>
                  <option value="URGENTE">Urgente</option>
                </select>
              </label>
            </div>

            <div className="space-y-4 text-sm">
              {/* Identificação do item */}
              <section className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 sm:p-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Nome
                  </p>
                  <h3 className="mt-1 text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
                    {displayName(row)}
                  </h3>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                      Foto do produto
                    </p>
                    {row.productImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.productImageUrl}
                        alt={displayName(row)}
                        className="product-image rounded-xl border border-gray-200 bg-white"
                      />
                    ) : (
                      <div className="product-image-placeholder flex items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
                        Sem foto
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                      Logo do cliente
                    </p>
                    {row.images.length > 0 ? (
                      <div className="customer-logo-grid">
                        {row.images.map((image) => {
                          const src = purchaseImageSrc(row.id, image.id, image.url);
                          const removing = removingImageId === image.id;
                          return (
                            <div key={image.id} className="customer-logo-item">
                              <button
                                type="button"
                                onClick={() => setLightboxImage(image)}
                                className="block h-full w-full"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={src} alt="Logo do cliente" />
                              </button>
                              {canEditOpenRequest ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleRemoveLogo(image);
                                  }}
                                  disabled={removing}
                                  className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/85 disabled:opacity-60"
                                  aria-label="Remover logo"
                                >
                                  {removing ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <X className="h-3 w-3" />
                                  )}
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="customer-logo-placeholder flex items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
                        Nenhuma imagem
                      </div>
                    )}
                    {canEditOpenRequest ? (
                      <div className="mt-3">
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            void handleUploadLogo(e.target.files);
                            e.target.value = '';
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => logoInputRef.current?.click()}
                          disabled={uploadingLogo}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:opacity-60"
                        >
                          {uploadingLogo ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                          Anexar imagem
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      SKU
                    </p>
                    <p className="mt-1 font-semibold text-gray-900">
                      {row.sku ?? row.product?.sku ?? '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Fornecedor
                    </p>
                    <p className="mt-1 font-semibold text-gray-900">
                      {displaySupplierName(row) || '—'}
                    </p>
                  </div>
                </div>
              </section>

              {/* Quantidade — Preço — Total */}
              <section className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  {canEditOpenRequest ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Quantidade
                      </p>
                      <div className="mt-1 flex gap-2">
                        <input
                          type="number"
                          min={1}
                          value={quantityInput}
                          onChange={(e) => setQuantityInput(e.target.value)}
                          onBlur={() => void handleSaveQuantity()}
                          className={fieldClass()}
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveQuantity()}
                          disabled={savingQuantity || !quantityInput}
                          className="inline-flex shrink-0 items-center gap-2 erp-focus-ring erp-btn erp-btn-primary erp-btn--sm disabled:opacity-60"
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
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Quantidade
                      </p>
                      <p className="mt-1 font-semibold">{displayQty(row)}</p>
                    </div>
                  )}
                  {canEditOpenRequest && !isWeg ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Preço do item
                      </p>
                      <div className="mt-1 flex gap-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={itemPriceInput}
                          onChange={(e) => setItemPriceInput(e.target.value)}
                          onBlur={() => void handleSaveItemPrice()}
                          className={fieldClass()}
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveItemPrice()}
                          disabled={savingItemPrice}
                          className="inline-flex shrink-0 items-center gap-2 erp-focus-ring erp-btn erp-btn-primary erp-btn--sm disabled:opacity-60"
                        >
                          {savingItemPrice ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                          Salvar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        {isWeg ? 'Preço base WEG' : 'Preço do item'}
                      </p>
                      <p className="mt-1 font-semibold">
                        {isWeg
                          ? formatMoneyNumber(Number(purchaseUnitPrice(row)))
                          : formatMoney(purchaseUnitPrice(row) || null)}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Total
                    </p>
                    <p className="mt-1 text-base font-bold text-gray-900">
                      {formatMoneyNumber(liveTotal)}
                    </p>
                  </div>
                </div>
              </section>

              {/* Gravação: técnica — preço — total */}
              <section className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Gravação
                    </p>
                    <p className="mt-1 font-semibold text-gray-900">
                      {engravingTechnique || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Preço da gravação
                    </p>
                    <p className="mt-1 font-semibold text-gray-900">
                      {formatMoney(row.engravingPrice)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Total gravação
                    </p>
                    <p className="mt-1 text-base font-bold text-gray-900">
                      {formatMoneyNumber(liveEngravingTotal)}
                    </p>
                  </div>
                </div>
              </section>

              {/* Entrega */}
              <section className="grid gap-3 rounded-xl border border-gray-200 bg-white p-3 sm:grid-cols-2 sm:p-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Data prevista de chegada
                  </p>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="date"
                      value={expectedArrival}
                      disabled={!canEditOpenRequest}
                      onChange={(e) => setExpectedArrival(e.target.value)}
                      className={fieldClass()}
                    />
                    {canEditOpenRequest ? (
                      <button
                        type="button"
                        onClick={() => void handleSaveArrival()}
                        disabled={savingArrival || !expectedArrival}
                        className="inline-flex shrink-0 items-center gap-2 erp-focus-ring erp-btn erp-btn-primary erp-btn--sm disabled:opacity-60"
                      >
                        {savingArrival ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        Salvar
                      </button>
                    ) : null}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Endereço
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-gray-900">
                    {addressDisplay}
                  </p>
                </div>
              </section>

              {/* Link externo */}
              <section className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Link externo
                </p>
                {canEditOpenRequest ? (
                  <div className="mt-1 flex gap-2">
                    <input
                      type="url"
                      value={linkInput}
                      onChange={(e) => setLinkInput(e.target.value)}
                      onBlur={() => void handleSaveLink()}
                      placeholder="https://"
                      className={fieldClass()}
                    />
                    <button
                      type="button"
                      onClick={() => void handleSaveLink()}
                      disabled={savingLink}
                      className="inline-flex shrink-0 items-center gap-2 erp-focus-ring erp-btn erp-btn-primary erp-btn--sm disabled:opacity-60"
                    >
                      {savingLink ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Salvar
                    </button>
                  </div>
                ) : (
                  <p className="mt-1 break-all text-gray-900">
                    {row.link?.trim()
                      ? renderObservationWithLinks(row.link)
                      : '—'}
                  </p>
                )}
              </section>

              {/* Observação — só se houver dados */}
              {observationText ? (
                <section className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Observação
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-gray-900">
                    {renderObservationWithLinks(observationText)}
                  </p>
                </section>
              ) : null}

              {/* Responsável e valor */}
              <section className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Responsável pela requisição
                    </p>
                    <p className="mt-1 font-medium text-gray-900">
                      {row.requestedBy.name}
                      <span className="block text-xs text-gray-500">
                        {row.requestedBy.email}
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Valor compra
                    </p>
                    <p className="mt-1 text-base font-bold text-gray-900">
                      {formatMoney(row.purchaseValue)}
                    </p>
                  </div>
                </div>
                {row.refusalReason?.trim() ? (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-rose-600">
                      Motivo recusa
                    </p>
                    <p className="mt-1 text-rose-900">{row.refusalReason}</p>
                  </div>
                ) : null}
              </section>
            </div>

            {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

            <div className="mt-5 flex flex-wrap justify-between gap-2">
              {props.isAdmin ? (
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-100 px-4 py-2 text-sm font-semibold text-red-800 transition hover:bg-red-200 disabled:opacity-60"
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
                    className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white active:scale-[0.98]"
                  >
                    Recusar
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onAction('comprado', row)}
                    className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white active:scale-[0.98]"
                  >
                    Aprovar Requisição
                  </button>
                </div>
              ) : null}
            </div>

            <ComprasStageActions
              row={row}
              layout={isMobile ? 'sheet' : 'inline'}
              onStatusChanged={(updated) => {
                setRow(updated);
                props.onStatusChanged?.(updated);
              }}
              onError={setError}
              onDone={props.onClose}
            />
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
            <div className="absolute bottom-2 right-2 z-10">
              <button
                type="button"
                onClick={() => void handleDownloadImage(lightboxImage)}
                disabled={downloadingImageId === lightboxImage.id}
                className="inline-flex items-center gap-1 rounded-lg bg-black/70 px-2 py-1.5 text-xs text-white"
              >
                {downloadingImageId === lightboxImage.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Download className="h-3 w-3" />
                )}
                Download
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={purchaseImageSrc(row.id, lightboxImage.id, lightboxImage.url)}
              alt="Visualização ampliada"
              className="max-h-[85vh] max-w-full rounded-2xl border border-gray-200 object-contain"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
