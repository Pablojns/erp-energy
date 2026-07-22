'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { EmptyState } from '@/src/components/ui/empty-state';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

export type InventoryProductOption = {
  id: string;
  sku: string;
  name: string;
  price?: string;
  stockQty?: number;
  reservedQty?: number;
  availableQty?: number;
};

type PaginatedProducts = {
  data: InventoryProductOption[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

function money(value: string | number | undefined) {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function availableLabel(product: InventoryProductOption) {
  if (typeof product.availableQty === 'number' && Number.isFinite(product.availableQty)) {
    return product.availableQty;
  }
  if (
    typeof product.stockQty === 'number' &&
    typeof product.reservedQty === 'number'
  ) {
    return product.stockQty - product.reservedQty;
  }
  if (typeof product.stockQty === 'number') return product.stockQty;
  return null;
}

export function InventoryProductPickerModal(props: {
  open: boolean;
  onClose: () => void;
  onSelect: (product: InventoryProductOption) => void;
}) {
  const pageSize = 50;
  const [rows, setRows] = useState<InventoryProductOption[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const requestIdRef = useRef(0);

  const resetList = useCallback(() => {
    setPage(1);
    setRows([]);
    setHasMore(true);
    hasMoreRef.current = true;
    setTotal(0);
  }, []);

  const applySearch = () => {
    setSearch(searchInput.trim());
    resetList();
  };

  useEffect(() => {
    if (!props.open) return;
    setSearchInput('');
    setSearch('');
    setError(null);
    resetList();
  }, [props.open, resetList]);

  const load = useCallback(
    async (pageToLoad: number, append: boolean) => {
      const requestId = ++requestIdRef.current;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(pageToLoad),
          pageSize: String(pageSize),
          status: 'active',
          sortBy: 'sku',
          sortOrder: 'asc',
        });
        if (search) params.set('search', search);

        const res = await erpFetchJson<PaginatedProducts>(
          `products?${params.toString()}`,
        );
        if (requestId !== requestIdRef.current) return;

        const nextRows = res.data ?? [];
        const meta = res.meta;
        setTotal(meta?.total ?? nextRows.length);
        setRows((prev) => (append ? [...prev, ...nextRows] : nextRows));
        const more =
          meta != null
            ? pageToLoad < meta.totalPages
            : nextRows.length >= pageSize;
        setHasMore(more);
        hasMoreRef.current = more;
      } catch (e) {
        if (requestId !== requestIdRef.current) return;
        setError(
          e instanceof Error ? e.message : 'Falha ao carregar produtos do estoque.',
        );
        if (!append) setRows([]);
        setHasMore(false);
        hasMoreRef.current = false;
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
          loadingMoreRef.current = false;
        }
      }
    },
    [search],
  );

  useEffect(() => {
    if (!props.open) return;
    void load(page, page > 1);
  }, [props.open, page, load]);

  useEffect(() => {
    if (!props.open) return;
    const root = listRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit) return;
        if (loading || loadingMoreRef.current) return;
        if (!hasMoreRef.current) return;
        loadingMoreRef.current = true;
        setPage((p) => p + 1);
      },
      { root, rootMargin: '240px', threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [props.open, loading, rows.length, hasMore]);

  if (!props.open) return null;

  return (
    <div className="erp-modal-overlay">
      <button
        type="button"
        className="erp-modal-backdrop"
        onClick={props.onClose}
        aria-label="Fechar"
      />
      <section className="erp-modal-panel catalog-search-modal relative flex max-h-[80vh] w-full max-w-5xl flex-col overflow-hidden">
        <button
          type="button"
          onClick={props.onClose}
          className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-[var(--erp-fg-muted)] hover:bg-[var(--erp-bg)]"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <div className="shrink-0 border-b border-[var(--erp-border)] px-4 py-3 pr-12">
          <h2 className="text-base font-semibold text-[var(--erp-fg)]">
            Buscar produto no estoque
          </h2>
          <p className="mt-0.5 text-xs text-[var(--erp-fg-muted)]">
            Catálogo interno do ERP — SKU, nome e estoque disponível.
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-col gap-2 border-b border-[var(--erp-border)] p-3">
            <label className="block min-w-[min(100%,14rem)] flex-1 text-xs font-medium text-[var(--erp-fg-muted)]">
              Buscar
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-fg-muted)]" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applySearch();
                  }}
                  placeholder="Buscar por nome ou SKU interno…"
                  className="erp-module-input pl-9"
                  autoFocus
                />
              </div>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={applySearch}
                className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white"
              >
                Buscar
              </button>
              <span className="text-xs text-[var(--erp-fg-muted)]">
                {total > 0 ? `${total} produto(s)` : null}
              </span>
            </div>
            {error ? (
              <p className="text-xs text-rose-500">{error}</p>
            ) : null}
          </div>

          <div ref={listRef} className="erp-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
            {loading && rows.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--erp-fg-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando estoque…
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                title="Nenhum produto encontrado"
                description="Ajuste a busca ou cadastre o item no Estoque."
              />
            ) : (
              <ul className="divide-y divide-[var(--erp-border)] rounded-xl border border-[var(--erp-border)] bg-[var(--erp-bg-card)]">
                {rows.map((product) => {
                  const available = availableLabel(product);
                  return (
                    <li key={product.id}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-[var(--erp-bg)]"
                        onClick={() => {
                          props.onSelect(product);
                          props.onClose();
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[var(--erp-fg)]">
                            {product.name}
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] text-[var(--erp-fg-muted)]">
                            {product.sku}
                          </p>
                        </div>
                        <div className="shrink-0 text-right text-xs">
                          <p className="font-semibold tabular-nums text-[var(--erp-fg)]">
                            {money(product.price)}
                          </p>
                          <p className="mt-0.5 text-[var(--erp-fg-muted)]">
                            Disp.:{' '}
                            <span className="font-semibold tabular-nums text-[var(--erp-fg)]">
                              {available == null ? '—' : available}
                            </span>
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div ref={sentinelRef} className="h-8 w-full" aria-hidden />
            {loadingMore ? (
              <div className="flex items-center justify-center gap-2 py-3 text-xs text-[var(--erp-fg-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Carregando mais…
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
