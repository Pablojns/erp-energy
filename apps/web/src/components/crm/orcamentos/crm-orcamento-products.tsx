'use client';

import { useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { CrmOrcamentoCatalogPickerModal } from '@/src/components/crm/orcamentos/crm-orcamento-catalog-picker';
import {
  addQuoteItem,
  deleteQuoteItem,
  formatQuoteCurrency,
  updateQuoteItem,
  type QuoteCatalogProductDto,
  type QuoteDto,
  type QuoteItemDto,
  type UpdateQuoteItemPayload,
} from '@/src/services/api/quotes-api';

const ENGRAVING_TYPES = [
  'Silk Screen',
  'Laser',
  'Transfer',
  'Bordado',
  'Outro',
] as const;

function parseEngraving(value: string | null | undefined): {
  type: string;
  area: string;
} {
  if (!value?.trim()) return { type: '', area: '' };
  const parts = value.split('·').map((p) => p.trim());
  if (parts.length >= 2) {
    return {
      type: parts[0] ?? '',
      area: parts.slice(1).join(' · ').replace(/\s*cm$/i, '').trim(),
    };
  }
  return { type: value.trim(), area: '' };
}

function buildEngraving(type: string, area: string): string | null {
  const t = type.trim();
  const a = area.trim();
  if (!t && !a) return null;
  if (t && a) return `${t} · ${a} cm`;
  if (t) return t;
  return `${a} cm`;
}

function readFileAsBase64(file: File): Promise<{
  base64: string;
  mimeType: string;
  fileName: string;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      resolve({
        base64,
        mimeType: file.type || 'application/octet-stream',
        fileName: file.name,
      });
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo de arte.'));
    reader.readAsDataURL(file);
  });
}

export function CrmOrcamentoProductsSection(props: {
  quote: QuoteDto;
  onQuoteChange: (quote: QuoteDto) => void;
  onError: (message: string | null) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const items = props.quote.items ?? [];

  const liveSubtotal = useMemo(
    () =>
      items.reduce((acc, item) => {
        const line = Number(item.unitPrice) * item.quantity;
        return acc + (Number.isFinite(line) ? line : 0);
      }, 0),
    [items],
  );

  const freight = props.quote.freightToConsult
    ? 0
    : Number(props.quote.freightValue ?? 0);
  const liveTotal = liveSubtotal + (Number.isFinite(freight) ? freight : 0);

  const patchLocalItem = (itemId: string, patch: Partial<QuoteItemDto>) => {
    const nextItems = items.map((item) => {
      if (item.id !== itemId) return item;
      const quantity = patch.quantity ?? item.quantity;
      const unitPrice = patch.unitPrice ?? item.unitPrice;
      const total = String(Number(unitPrice) * quantity);
      return { ...item, ...patch, quantity, unitPrice, total };
    });
    props.onQuoteChange({
      ...props.quote,
      items: nextItems,
      subtotal: String(nextItems.reduce((s, i) => s + Number(i.total), 0)),
      total: String(
        nextItems.reduce((s, i) => s + Number(i.total), 0) +
          (props.quote.freightToConsult ? 0 : Number(props.quote.freightValue ?? 0)),
      ),
    });
  };

  const persistItem = async (
    itemId: string,
    payload: UpdateQuoteItemPayload,
  ) => {
    setBusyId(itemId);
    props.onError(null);
    try {
      const updated = await updateQuoteItem(props.quote.id, itemId, payload);
      props.onQuoteChange(updated);
    } catch (err) {
      props.onError(err instanceof Error ? err.message : 'Falha ao atualizar item.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSelectProduct = async (product: QuoteCatalogProductDto) => {
    setAdding(true);
    props.onError(null);
    try {
      const updated = await addQuoteItem(props.quote.id, {
        catalogProductId: product.id,
        quantity: 1,
        unitPrice: Number(product.salePrice),
        supplier: product.supplier,
      });
      props.onQuoteChange(updated);
    } catch (err) {
      props.onError(err instanceof Error ? err.message : 'Falha ao adicionar produto.');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (itemId: string) => {
    if (!window.confirm('Remover este produto do orçamento?')) return;
    setBusyId(itemId);
    props.onError(null);
    try {
      const updated = await deleteQuoteItem(props.quote.id, itemId);
      props.onQuoteChange(updated);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    } catch (err) {
      props.onError(err instanceof Error ? err.message : 'Falha ao remover item.');
    } finally {
      setBusyId(null);
    }
  };

  const handleEngravingChange = async (
    item: QuoteItemDto,
    type: string,
    area: string,
  ) => {
    const next = buildEngraving(type, area);
    const requiresArtwork = item.supplier === 'SPOT' && Boolean(next);
    patchLocalItem(item.id, {
      engraving: next,
      requiresArtwork,
      ...(requiresArtwork
        ? {}
        : {
            artworkFileName: null,
            artworkMimeType: null,
            artworkData: null,
          }),
    });
    await persistItem(item.id, {
      engraving: next,
      requiresArtwork,
      ...(requiresArtwork
        ? {}
        : {
            artworkFileName: null,
            artworkMimeType: null,
            artworkData: null,
          }),
    });
  };

  const handleArtworkUpload = async (item: QuoteItemDto, file: File | null) => {
    if (!file) return;
    const allowed = /^(image\/|application\/pdf)/i.test(file.type);
    if (!allowed) {
      props.onError('Envie uma imagem ou PDF como arquivo de arte.');
      return;
    }
    setBusyId(item.id);
    props.onError(null);
    try {
      const parsed = await readFileAsBase64(file);
      patchLocalItem(item.id, {
        requiresArtwork: true,
        artworkFileName: parsed.fileName,
        artworkMimeType: parsed.mimeType,
        artworkData: parsed.base64,
      });
      await persistItem(item.id, {
        requiresArtwork: true,
        artworkFileName: parsed.fileName,
        artworkMimeType: parsed.mimeType,
        artworkData: parsed.base64,
      });
    } catch (err) {
      props.onError(err instanceof Error ? err.message : 'Falha ao enviar arquivo de arte.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--erp-border)] bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--erp-fg)]">Produtos</h3>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={adding}
          className="erp-focus-ring erp-btn erp-btn-primary erp-btn--md disabled:opacity-50"
        >
          {adding ? (
            <Loader2 className="erp-icon-sm animate-spin" />
          ) : (
            <Plus className="erp-icon-sm" aria-hidden />
          )}
          Adicionar Produto
        </button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--erp-border)] bg-[var(--erp-bg)] px-3 py-6 text-center text-sm text-[var(--erp-fg-muted)]">
          Nenhum produto neste orçamento.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-[var(--erp-fg-muted)]">
              <tr className="border-b border-[var(--erp-border)]">
                <th className="px-2 py-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selected.size === items.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelected(new Set(items.map((i) => i.id)));
                      } else {
                        setSelected(new Set());
                      }
                    }}
                    aria-label="Selecionar todos"
                  />
                </th>
                <th className="px-2 py-2 font-semibold">Imagem</th>
                <th className="px-2 py-2 font-semibold">SKU</th>
                <th className="px-2 py-2 font-semibold">Descrição</th>
                <th className="px-2 py-2 font-semibold">Gravação</th>
                <th className="px-2 py-2 font-semibold">Qtd</th>
                <th className="px-2 py-2 font-semibold">Preço unit.</th>
                <th className="px-2 py-2 font-semibold">Total</th>
                <th className="px-2 py-2 font-semibold"> </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const engraving = parseEngraving(item.engraving);
                const showArtwork =
                  item.supplier === 'SPOT' &&
                  (item.requiresArtwork || Boolean(item.engraving?.trim()));
                return (
                  <tr key={item.id} className="border-b border-[var(--erp-border)]/70">
                    <td className="px-2 py-2 align-top">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={(e) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(item.id);
                            else next.delete(item.id);
                            return next;
                          });
                        }}
                        aria-label={`Selecionar ${item.sku}`}
                      />
                    </td>
                    <td className="px-2 py-2 align-top">
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-[var(--erp-bg)] text-[10px] text-[var(--erp-fg-muted)]">
                          —
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 align-top font-medium text-[#2AACE2]">
                      <div>{item.sku}</div>
                      {item.supplier ? (
                        <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--erp-fg-muted)]">
                          {item.supplier}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 align-top">{item.description}</td>
                    <td className="px-2 py-2 align-top">
                      <div className="flex min-w-[13rem] flex-col gap-1">
                        <select
                          value={engraving.type}
                          disabled={busyId === item.id}
                          onChange={(e) => {
                            void handleEngravingChange(
                              item,
                              e.target.value,
                              engraving.area,
                            );
                          }}
                          className="erp-module-input"
                        >
                          <option value="">Sem gravação</option>
                          {ENGRAVING_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                        <input
                          value={engraving.area}
                          disabled={busyId === item.id}
                          placeholder="Área cm (ex: 5x3)"
                          onChange={(e) => {
                            const next = buildEngraving(
                              engraving.type,
                              e.target.value,
                            );
                            const requiresArtwork =
                              item.supplier === 'SPOT' && Boolean(next);
                            patchLocalItem(item.id, {
                              engraving: next,
                              requiresArtwork,
                            });
                          }}
                          onBlur={() => {
                            const current = parseEngraving(
                              items.find((i) => i.id === item.id)?.engraving,
                            );
                            void handleEngravingChange(
                              item,
                              current.type,
                              current.area,
                            );
                          }}
                          className="erp-module-input"
                        />
                        {showArtwork ? (
                          <div className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                            <p className="font-medium">
                              Este produto requer arquivo de arte para produção
                            </p>
                            <label className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100">
                              <Upload className="h-3.5 w-3.5" aria-hidden />
                              {item.artworkFileName
                                ? 'Trocar arquivo'
                                : 'Enviar arte (imagem/PDF)'}
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                className="hidden"
                                disabled={busyId === item.id}
                                onChange={(e) => {
                                  const file = e.target.files?.[0] ?? null;
                                  void handleArtworkUpload(item, file);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                            {item.artworkFileName ? (
                              <p className="mt-1 truncate text-[10px] text-amber-800">
                                Arquivo: {item.artworkFileName}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-2 align-top">
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        disabled={busyId === item.id}
                        onChange={(e) => {
                          const quantity = Math.max(1, Number(e.target.value) || 1);
                          patchLocalItem(item.id, { quantity });
                        }}
                        onBlur={(e) => {
                          const quantity = Math.max(1, Number(e.target.value) || 1);
                          void persistItem(item.id, { quantity });
                        }}
                        className="erp-module-input w-20"
                      />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.unitPrice}
                        disabled={busyId === item.id}
                        onChange={(e) => {
                          patchLocalItem(item.id, { unitPrice: e.target.value });
                        }}
                        onBlur={(e) => {
                          const unitPrice = Math.max(0, Number(e.target.value) || 0);
                          void persistItem(item.id, { unitPrice });
                        }}
                        className="erp-module-input w-28"
                      />
                    </td>
                    <td className="px-2 py-2 align-top font-medium">
                      {formatQuoteCurrency(item.total)}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <button
                        type="button"
                        onClick={() => void handleRemove(item.id)}
                        disabled={busyId === item.id}
                        className="erp-focus-ring rounded-md p-1.5 text-[var(--erp-fg-muted)] hover:bg-[var(--erp-bg)] hover:text-rose-600 disabled:opacity-40"
                        title="Remover"
                        aria-label={`Remover ${item.sku}`}
                      >
                        {busyId === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex flex-wrap justify-end gap-4 text-sm">
        <span className="text-[var(--erp-fg-muted)]">
          Subtotal:{' '}
          <strong className="text-[var(--erp-fg)]">
            {formatQuoteCurrency(liveSubtotal)}
          </strong>
        </span>
        <span className="text-[var(--erp-fg-muted)]">
          Total:{' '}
          <strong className="text-[var(--erp-fg)]">
            {formatQuoteCurrency(liveTotal)}
          </strong>
        </span>
      </div>

      <CrmOrcamentoCatalogPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(product) => void handleSelectProduct(product)}
      />
    </div>
  );
}
