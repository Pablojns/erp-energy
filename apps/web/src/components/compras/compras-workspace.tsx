'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Filter, Plus, Search, X } from 'lucide-react';
import { fetchPurchaseRequests } from './compras-api';
import { ComprasDashboard } from './compras-dashboard';
import { ComprasDetailModal } from './compras-detail-modal';
import { ComprasKanbanBoard } from './compras-kanban-board';
import { ComprasNewRequestModal } from './compras-new-request-modal';
import {
  ComprasPeriodFilter,
  getCurrentMonthRange,
} from './compras-period-filter';
import { ComprasResolveModal } from './compras-resolve-modal';
import type { PurchasePriority, PurchaseRequest, PurchaseType } from './compras-types';

const COMPRAS_FILTERS_STORAGE_KEY = 'erp.compras.filters';

type StoredComprasFilters = {
  typeFilter: 'all' | PurchaseType;
  priorityFilter: 'all' | PurchasePriority;
};

function readStoredFilters(): StoredComprasFilters {
  const fallback: StoredComprasFilters = {
    typeFilter: 'all',
    priorityFilter: 'all',
  };
  try {
    const raw = window.localStorage.getItem(COMPRAS_FILTERS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoredComprasFilters>;
    const typeFilter =
      parsed.typeFilter === 'WEG_CONTRATO' ||
      parsed.typeFilter === 'VENDA_EXTERNA' ||
      parsed.typeFilter === 'MARKETPLACE' ||
      parsed.typeFilter === 'all'
        ? parsed.typeFilter
        : 'all';
    const priorityFilter =
      parsed.priorityFilter === 'URGENTE' ||
      parsed.priorityFilter === 'NORMAL' ||
      parsed.priorityFilter === 'all'
        ? parsed.priorityFilter
        : 'all';
    return { typeFilter, priorityFilter };
  } catch {
    return fallback;
  }
}

function writeStoredFilters(filters: StoredComprasFilters): void {
  try {
    window.localStorage.setItem(COMPRAS_FILTERS_STORAGE_KEY, JSON.stringify(filters));
  } catch {
    /* ignore quota / private mode */
  }
}

export function ComprasWorkspace(props: { isAdmin: boolean }) {
  const [activeView, setActiveView] = useState<'dashboard' | 'compras'>('dashboard');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | PurchaseType>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | PurchasePriority>('all');
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => getCurrentMonthRange().from);
  const [dateTo, setDateTo] = useState(() => getCurrentMonthRange().to);
  const [rows, setRows] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [newOpen, setNewOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [resolveAction, setResolveAction] = useState<{
    row: PurchaseRequest;
    action: 'comprado' | 'recusar';
  } | null>(null);

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  const handlePeriodChange = useCallback((from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
  }, []);

  const hasActiveFilters = typeFilter !== 'all' || priorityFilter !== 'all';

  useEffect(() => {
    const stored = readStoredFilters();
    setTypeFilter(stored.typeFilter);
    setPriorityFilter(stored.priorityFilter);
    setFiltersHydrated(true);
  }, []);

  useEffect(() => {
    if (!filtersHydrated) return;
    writeStoredFilters({ typeFilter, priorityFilter });
  }, [filtersHydrated, typeFilter, priorityFilter]);

  const applyTypeFilter = useCallback((value: 'all' | PurchaseType) => {
    setTypeFilter(value);
    setFiltersOpen(false);
  }, []);

  const applyPriorityFilter = useCallback((value: 'all' | PurchasePriority) => {
    setPriorityFilter(value);
    setFiltersOpen(false);
  }, []);

  const clearFilters = useCallback(() => {
    setTypeFilter('all');
    setPriorityFilter('all');
    setFiltersOpen(false);
  }, []);

  useEffect(() => {
    if (!filtersHydrated) return;

    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('page', '1');
        params.set('pageSize', '100');
        if (dateFrom.trim()) params.set('startDate', dateFrom.trim());
        if (dateTo.trim()) params.set('endDate', dateTo.trim());

        if (activeView === 'compras') {
          const cleanSearch = search.trim();
          if (cleanSearch) params.set('search', cleanSearch);
          if (typeFilter !== 'all') params.set('type', typeFilter);
          if (priorityFilter !== 'all') params.set('priority', priorityFilter);
        }

        const data = await fetchPurchaseRequests(params);
        if (!controller.signal.aborted) setRows(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar compras.');
          setRows([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    const timer = window.setTimeout(() => void load(), 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    activeView,
    dateFrom,
    dateTo,
    filtersHydrated,
    priorityFilter,
    refreshToken,
    search,
    typeFilter,
  ]);

  const handleStatusChanged = (updated: PurchaseRequest) => {
    setRows((current) => {
      if (updated.status === 'RECUSADO') {
        return current.filter((row) => row.id !== updated.id);
      }
      const index = current.findIndex((row) => row.id === updated.id);
      if (index === -1) return [...current, updated];
      const next = [...current];
      next[index] = updated;
      return next;
    });
  };

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (typeFilter !== 'all') parts.push(typeFilter);
    if (priorityFilter !== 'all') parts.push(priorityFilter);
    return parts.join(' · ');
  }, [priorityFilter, typeFilter]);

  const toolbarFilters = (
    <>
      <div className="relative flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFiltersOpen((value) => !value)}
          className={`erp-focus-ring erp-btn erp-btn-secondary erp-btn--md relative${
            hasActiveFilters ? ' border-[var(--accent)]' : ''
          }`}
          aria-expanded={filtersOpen}
          title={hasActiveFilters ? `Filtros: ${filterSummary}` : 'Filtros'}
        >
          <Filter className="erp-icon-sm" />
          Filtros
          <ChevronDown className="erp-icon-sm" />
          {hasActiveFilters ? (
            <span
              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--accent)] ring-2 ring-white"
              aria-hidden
            />
          ) : null}
        </button>

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="erp-focus-ring erp-btn erp-btn-secondary erp-btn--md"
          >
            <X className="erp-icon-sm" />
            Limpar filtros
          </button>
        ) : null}

        {filtersOpen ? (
          <div className="erp-module-card absolute right-0 top-12 z-20 w-[min(92vw,20rem)] p-3 shadow-lg">
            <FilterSelect
              label="Tipo"
              value={typeFilter}
              onChange={(value) => applyTypeFilter(value as typeof typeFilter)}
            >
              <option value="all">Todos</option>
              <option value="WEG_CONTRATO">WEG</option>
              <option value="VENDA_EXTERNA">Venda Externa</option>
              <option value="MARKETPLACE">Marketplace</option>
            </FilterSelect>
            <FilterSelect
              label="Prioridade"
              value={priorityFilter}
              onChange={(value) => applyPriorityFilter(value as typeof priorityFilter)}
            >
              <option value="all">Todas</option>
              <option value="URGENTE">Urgente</option>
              <option value="NORMAL">Normal</option>
            </FilterSelect>
          </div>
        ) : null}
      </div>

      <ComprasPeriodFilter
        dateFrom={dateFrom}
        dateTo={dateTo}
        onChange={handlePeriodChange}
      />
    </>
  );

  return (
    <div className="erp-module-page flex h-[calc(100dvh-7.5rem)] min-h-0 flex-col px-4 py-4 sm:px-6">
      <header className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="erp-module-title">Compras</h1>
          <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => setActiveView('dashboard')}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                activeView === 'dashboard'
                  ? 'bg-white text-slate-950'
                  : 'text-[var(--erp-fg-secondary)] hover:bg-gray-100 hover:text-[var(--erp-fg)]'
              }`}
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => setActiveView('compras')}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                activeView === 'compras'
                  ? 'bg-white text-slate-950'
                  : 'text-[var(--erp-fg-secondary)] hover:bg-gray-100 hover:text-[var(--erp-fg)]'
              }`}
            >
              Compras
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          {activeView === 'compras' ? (
            <div className="relative min-w-[min(100%,16rem)] flex-1 sm:max-w-[20rem] sm:flex-initial">
              <Search className="pointer-events-none absolute left-3 top-1/2 erp-icon-sm -translate-y-1/2 text-[var(--erp-fg-muted)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por item, SKU, produto..."
                className="erp-module-input pl-9"
              />
            </div>
          ) : null}

          {toolbarFilters}

          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="erp-focus-ring erp-btn erp-btn-primary erp-btn--md"
          >
            <Plus className="erp-icon-sm" aria-hidden />
            Nova Solicitação
          </button>
        </div>
      </header>

      {error ? (
        <div className="erp-alert-danger mb-3 shrink-0">{error}</div>
      ) : null}

      {activeView === 'dashboard' ? (
        <ComprasDashboard rows={rows} loading={loading} />
      ) : (
        <section className="erp-module-panel flex min-h-0 flex-1 flex-col overflow-hidden p-3">
          <ComprasKanbanBoard
            rows={rows}
            loading={loading}
            onOpenCard={(row) => setDetailId(row.id)}
            onStatusChanged={handleStatusChanged}
            onError={setError}
          />
        </section>
      )}

      {newOpen ? (
        <ComprasNewRequestModal
          onClose={() => setNewOpen(false)}
          onCreated={() => {
            setNewOpen(false);
            refresh();
          }}
        />
      ) : null}

      {activeView === 'compras' ? (
        <button
          type="button"
          className="erp-mobile-kanban-fab md:hidden"
          aria-label="Nova solicitação"
          onClick={() => setNewOpen(true)}
        >
          <Plus className="h-6 w-6" />
        </button>
      ) : null}

      {detailId ? (
        <ComprasDetailModal
          rowId={detailId}
          isAdmin={props.isAdmin}
          onClose={() => setDetailId(null)}
          onAction={(action, row) => {
            setDetailId(null);
            setResolveAction({ row, action });
          }}
          onStatusChanged={handleStatusChanged}
          onDeleted={() => {
            setDetailId(null);
            refresh();
          }}
        />
      ) : null}

      {resolveAction ? (
        <ComprasResolveModal
          row={resolveAction.row}
          action={resolveAction.action}
          onClose={() => setResolveAction(null)}
          onResolved={() => {
            setResolveAction(null);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function FilterSelect(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="mb-3 block last:mb-0">
      <span className="erp-label-caps mb-1 block">{props.label}</span>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="erp-module-input"
      >
        {props.children}
      </select>
    </label>
  );
}
