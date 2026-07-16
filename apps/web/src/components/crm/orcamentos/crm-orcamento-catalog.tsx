'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Filter, Loader2, RefreshCw, Search } from 'lucide-react';
import { EmptyState } from '@/src/components/ui/empty-state';
import {
  formatQuoteCurrency,
  listQuoteCatalog,
  syncQuoteCatalog,
  syncSpotQuoteCatalog,
  type QuoteCatalogProductDto,
} from '@/src/services/api/quotes-api';

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

export function CrmOrcamentoCatalog(props: {
  selectable?: boolean;
  onSelect?: (product: QuoteCatalogProductDto) => void;
}) {
  const infinite = Boolean(props.selectable);
  const [rows, setRows] = useState<QuoteCatalogProductDto[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = infinite ? 50 : 20;
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingSpot, setSyncingSpot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);
  const scrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasMoreRef = useRef(true);

  const applySearch = () => {
    setSearch(searchInput.trim());
    setPage(1);
    if (infinite) {
      setRows([]);
      setHasMore(true);
      hasMoreRef.current = true;
    }
  };

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const isAppend = infinite && page > 1;
      if (isAppend) {
        loadingMoreRef.current = true;
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const res = await listQuoteCatalog({
          search: search || undefined,
          page,
          pageSize,
          includeTotal: infinite ? false : true,
        });
        if (signal?.aborted) return;
        setRows((prev) => (isAppend ? [...prev, ...res.data] : res.data));
        const nextHasMore =
          typeof res.meta.hasMore === 'boolean'
            ? res.meta.hasMore
            : res.data.length === pageSize;
        setHasMore(nextHasMore);
        hasMoreRef.current = nextHasMore;
        if (!infinite) {
          setTotal(res.meta.total);
          setTotalPages(res.meta.totalPages);
        }
        setLastSyncAt(res.meta.lastSyncAt);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : 'Falha ao carregar catálogo.');
        if (!isAppend) setRows([]);
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setLoadingMore(false);
          loadingMoreRef.current = false;
        }
      }
    },
    [infinite, page, pageSize, search],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refreshToken]);

  useEffect(() => {
    return () => {
      if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
    };
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    setError(null);
    try {
      const result = await syncQuoteCatalog();
      setSyncMessage(result.message);
      if (result.ok) {
        setPage(1);
        setRows([]);
        setHasMore(true);
        hasMoreRef.current = true;
        setRefreshToken((v) => v + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao sincronizar catálogo XBZ.');
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncSpot = async () => {
    setSyncingSpot(true);
    setSyncMessage(null);
    setError(null);
    try {
      const result = await syncSpotQuoteCatalog();
      setSyncMessage(result.message);
      if (result.ok) {
        setPage(1);
        setRows([]);
        setHasMore(true);
        hasMoreRef.current = true;
        setRefreshToken((v) => v + 1);
      } else if (!result.ok) {
        setError(result.message);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Configure as credenciais SPOT no servidor para sincronizar este fornecedor.',
      );
    } finally {
      setSyncingSpot(false);
    }
  };

  const handleListScroll = () => {
    if (!infinite) return;
    if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
    scrollDebounceRef.current = setTimeout(() => {
      const el = listRef.current;
      if (!el || loading || loadingMoreRef.current) return;
      if (!hasMoreRef.current) return;
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (remaining <= 500) {
        loadingMoreRef.current = true;
        setPage((p) => p + 1);
      }
    }, 120);
  };

  return (
    <section
      className={
        props.selectable
          ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
          : 'erp-module-panel flex min-h-0 flex-1 flex-col overflow-hidden'
      }
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--erp-border)] p-3">
        <div className="relative min-w-[min(100%,14rem)] flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-fg-muted)]" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch();
            }}
            placeholder="Buscar por nome ou SKU..."
            className="erp-module-input pl-9"
          />
        </div>
        <button
          type="button"
          onClick={applySearch}
          className="erp-focus-ring erp-btn erp-btn-secondary erp-btn--md"
        >
          <Filter className="erp-icon-sm" aria-hidden />
          Filtrar
        </button>
        {!props.selectable ? (
          <>
            <button
              type="button"
              onClick={() => void handleSync()}
              disabled={syncing || syncingSpot}
              className="erp-focus-ring erp-btn erp-btn-primary erp-btn--md disabled:opacity-50"
            >
              {syncing ? (
                <Loader2 className="erp-icon-sm animate-spin" />
              ) : (
                <RefreshCw className="erp-icon-sm" aria-hidden />
              )}
              Sincronizar XBZ
            </button>
            <button
              type="button"
              onClick={() => void handleSyncSpot()}
              disabled={syncing || syncingSpot}
              className="erp-focus-ring erp-btn erp-btn-secondary erp-btn--md disabled:opacity-50"
            >
              {syncingSpot ? (
                <Loader2 className="erp-icon-sm animate-spin" />
              ) : (
                <RefreshCw className="erp-icon-sm" aria-hidden />
              )}
              Sincronizar SPOT
            </button>
          </>
        ) : null}
        <span className="text-xs text-[var(--erp-fg-muted)]">
          Última sync: {formatDateTime(lastSyncAt)}
        </span>
      </div>

      {error ? <div className="erp-alert-danger mx-3 mt-3 shrink-0">{error}</div> : null}
      {syncMessage ? (
        <div className="mx-3 mt-3 shrink-0 rounded-lg border border-[#5BBFB0]/40 bg-[#5BBFB0]/10 px-3 py-2 text-sm text-[var(--erp-fg)]">
          {syncMessage}
        </div>
      ) : null}

      <div
        ref={listRef}
        onScroll={handleListScroll}
        className={
          props.selectable
            ? 'catalog-search-results'
            : 'min-h-0 flex-1 overflow-auto'
        }
      >
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-[var(--erp-fg-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando catálogo...
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Catálogo vazio"
            description="Sincronize o catálogo XBZ ou SPOT para carregar os produtos."
          />
        ) : (
          <>
            <table className="catalog-search-table w-full min-w-[800px] text-left text-sm">
              <thead className="catalog-search-table-head text-xs uppercase tracking-wide text-[var(--erp-fg-muted)]">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Imagem</th>
                  <th className="px-3 py-2.5 font-semibold">SKU</th>
                  <th className="px-3 py-2.5 font-semibold">Fornecedor</th>
                  <th className="px-3 py-2.5 font-semibold">Nome</th>
                  <th className="px-3 py-2.5 font-semibold">Preço</th>
                  <th className="px-3 py-2.5 font-semibold">Estoque</th>
                  <th className="px-3 py-2.5 font-semibold">Última atualização</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  {props.selectable ? (
                    <th className="px-3 py-2.5 font-semibold">Ação</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--erp-border)]/70 hover:bg-[var(--erp-bg-hover)]"
                  >
                    <td className="px-3 py-2">
                      {row.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.imageUrl}
                          alt=""
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-[var(--erp-bg)] text-[10px] text-[var(--erp-fg-muted)]">
                          —
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium text-[#2AACE2]">
                      {row.supplierCode}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                        {row.supplier || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-[var(--erp-fg)]">{row.name}</div>
                      {row.friendlyCode ? (
                        <div className="text-xs text-[var(--erp-fg-muted)]">
                          {row.friendlyCode}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{formatQuoteCurrency(row.salePrice)}</td>
                    <td className="px-3 py-2">{row.availableQty}</td>
                    <td className="px-3 py-2 text-[var(--erp-fg-muted)]">
                      {formatDateTime(row.lastSyncAt)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          row.active
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {row.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    {props.selectable ? (
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => props.onSelect?.(row)}
                          className="erp-focus-ring erp-btn erp-btn-primary erp-btn--sm"
                        >
                          Adicionar
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            {infinite && loadingMore ? (
              <div className="flex items-center justify-center gap-2 py-3 text-sm text-[var(--erp-fg-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando mais...
              </div>
            ) : null}
          </>
        )}
      </div>

      {infinite ? (
        <div className="flex shrink-0 items-center border-t border-[var(--erp-border)] px-3 py-2.5 text-xs text-[var(--erp-fg-muted)]">
          <span>
            {rows.length} produto{rows.length === 1 ? '' : 's'} carregados
            {hasMore ? ' · role para carregar mais' : ''}
          </span>
        </div>
      ) : (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--erp-border)] px-3 py-2.5 text-xs text-[var(--erp-fg-muted)]">
          <span>
            {total} produto{total === 1 ? '' : 's'} · página {page} de {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="erp-focus-ring erp-btn erp-btn-ghost erp-btn--sm disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="erp-focus-ring erp-btn erp-btn-ghost erp-btn--sm disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
