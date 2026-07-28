'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Loader2, Search, X } from 'lucide-react';
import { GlassCard } from '@/src/components/shell/glass-card';
import { GlowButton } from '@/src/components/shell/glow-button';
import { sortProductsForSearch } from '@/src/lib/product-search';
import type { BusinessContext } from '@/src/lib/business-context';
import {
  fetchAllStockProducts,
  type EstoqueBulkProduct,
} from '@/src/components/estoque/estoque-product-fetch';

function availableQty(p: EstoqueBulkProduct): number {
  if (typeof p.availableQty === 'number') return Math.max(0, p.availableQty);
  return Math.max(0, p.stockQty - (p.reservedQty ?? 0));
}

function toExportRows(products: EstoqueBulkProduct[]) {
  return products.map((p) => ({
    SKU: p.sku,
    Nome: p.name,
    'Qtd Real': p.stockQty,
    Reservado: p.reservedQty ?? 0,
    Disponível: availableQty(p),
    'Preço Base': p.cost != null && p.cost !== '' ? Number(p.cost) : '',
    'Preço Venda': Number(p.price),
    Categoria: p.category?.trim() || '—',
  }));
}

function downloadProductsXlsx(products: EstoqueBulkProduct[], filename: string) {
  const rows = toExportRows(products);
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Estoque');
  XLSX.writeFile(book, filename);
}

export function EstoqueExportModal(props: {
  open: boolean;
  mode: 'all' | 'selected';
  businessContext: BusinessContext;
  includeInactive?: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const {
    open,
    mode,
    businessContext,
    includeInactive = false,
    onClose,
    onError,
    onSuccess,
  } = props;
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [products, setProducts] = useState<EstoqueBulkProduct[]>([]);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setSearch('');
    setSelectedIds(new Set());
    void fetchAllStockProducts({ businessContext, includeInactive })
      .then((rows) => {
        if (!cancelled) setProducts(rows);
      })
      .catch((e) => {
        if (!cancelled) {
          onError(
            e instanceof Error
              ? e.message
              : 'Falha ao carregar produtos para exportação.',
          );
          onClose();
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open + context
  }, [open, businessContext, includeInactive]);

  const filtered = useMemo(
    () => sortProductsForSearch(products, search),
    [products, search],
  );

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const p of filtered) {
        if (checked) next.add(p.id);
        else next.delete(p.id);
      }
      return next;
    });
  };

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id));

  const exportNow = () => {
    const rows =
      mode === 'all'
        ? products
        : products.filter((p) => selectedIds.has(p.id));
    if (rows.length === 0) {
      onError(
        mode === 'all'
          ? 'Não há produtos para exportar.'
          : 'Selecione ao menos um produto.',
      );
      return;
    }
    setExporting(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const filename =
        mode === 'all'
          ? `estoque-completo-${stamp}.xlsx`
          : `estoque-selecionados-${stamp}.xlsx`;
      downloadProductsXlsx(rows, filename);
      onSuccess(`Excel gerado com ${rows.length} produto(s).`);
      onClose();
    } catch (e) {
      onError(
        e instanceof Error ? e.message : 'Falha ao gerar arquivo Excel.',
      );
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
    >
      <div
        className="flex h-[92dvh] w-full max-w-3xl flex-col sm:h-auto sm:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <GlassCard className="flex min-h-0 flex-1 flex-col border-gray-200 p-3 shadow-2xl sm:p-5">
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                {mode === 'all'
                  ? 'Exportar estoque completo'
                  : 'Exportar produtos selecionados'}
              </h2>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Gera arquivo .xlsx com SKU, nome, quantidades, preços e categoria.
              </p>
            </div>
            <button
              type="button"
              disabled={exporting}
              className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--input-bg)]"
              aria-label="Fechar"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {mode === 'selected' ? (
            <>
              <div className="relative mt-3 shrink-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder='Filtrar (ex: "camisa polo")…'
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] py-2.5 pl-10 pr-3 text-sm text-[var(--text-primary)] outline-none"
                />
              </div>
              <div className="mt-3 flex shrink-0 items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) => toggleVisible(e.target.checked)}
                    disabled={loading || filtered.length === 0}
                    className="h-3.5 w-3.5 accent-[var(--accent)]"
                  />
                  Selecionar visíveis ({filtered.length})
                </label>
                <span>{selectedIds.size} selecionado(s)</span>
              </div>
              <div className="erp-scrollbar mt-2 min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--border-color)]">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 px-3 py-10 text-sm text-[var(--text-muted)]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando produtos…
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">
                    Nenhum produto encontrado.
                  </p>
                ) : (
                  <table className="w-full min-w-[420px] border-collapse text-left text-sm">
                    <thead className="sticky top-0 bg-[var(--input-bg)] text-xs text-[var(--text-secondary)]">
                      <tr>
                        <th className="w-10 px-2 py-2" />
                        <th className="px-2 py-2">SKU</th>
                        <th className="px-2 py-2">Produto</th>
                        <th className="px-2 py-2 text-right">Qtd</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((p) => (
                        <tr
                          key={p.id}
                          className="border-t border-[var(--border-color)]"
                        >
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(p.id)}
                              onChange={() => toggleId(p.id)}
                              className="h-3.5 w-3.5 accent-[var(--accent)]"
                            />
                          </td>
                          <td className="px-2 py-2 font-mono text-xs">
                            {p.sku}
                          </td>
                          <td className="px-2 py-2">{p.name}</td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {p.stockQty}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <div className="mt-4 min-h-0 flex-1 rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-4 py-6 text-sm text-[var(--text-secondary)]">
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando produtos…
                </div>
              ) : (
                <p>
                  Serão exportados <strong>{products.length}</strong> produto(s)
                  do estoque no contexto atual.
                </p>
              )}
            </div>
          )}

          <div className="mt-3 flex shrink-0 justify-end gap-2">
            <GlowButton
              variant="secondary"
              disabled={exporting}
              onClick={onClose}
            >
              Cancelar
            </GlowButton>
            <GlowButton
              variant="primary"
              disabled={
                exporting ||
                loading ||
                (mode === 'selected' && selectedIds.size === 0) ||
                (mode === 'all' && products.length === 0)
              }
              onClick={exportNow}
            >
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Gerando…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Baixar Excel
                </>
              )}
            </GlowButton>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
