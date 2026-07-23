'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Plus, Search, X } from 'lucide-react';
import { fetchPurchaseRequests } from './compras-api';
import { ComprasDashboard } from './compras-dashboard';
import { ComprasDetailModal } from './compras-detail-modal';
import { ComprasKanbanBoard } from './compras-kanban-board';
import { ComprasNewRequestModal } from './compras-new-request-modal';
import {
  ComprasPeriodFilter,
} from './compras-period-filter';
import { ComprasResolveModal } from './compras-resolve-modal';
import type { PurchasePriority, PurchaseRequest, PurchaseType } from './compras-types';
import { TYPE_FILTER_OPTIONS } from './compras-types';

const COMPRAS_FILTERS_STORAGE_KEY = 'erp.compras.filters';

type StoredComprasFilters = {
  /** Sempre inicia em 'all' no load — não restaurar tipo salvo, senão WEG_CONTRATO some. */
  priorityFilter: 'all' | PurchasePriority;
};

function readStoredFilters(): StoredComprasFilters {
  const fallback: StoredComprasFilters = {
    priorityFilter: 'all',
  };
  try {
    const raw = window.localStorage.getItem(COMPRAS_FILTERS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoredComprasFilters>;
    const priorityFilter =
      parsed.priorityFilter === 'URGENTE' ||
      parsed.priorityFilter === 'NORMAL' ||
      parsed.priorityFilter === 'all'
        ? parsed.priorityFilter
        : 'all';
    return { priorityFilter };
  } catch {
    return fallback;
  }
}

function writeStoredFilters(filters: StoredComprasFilters): void {
  try {
    window.localStorage.setItem(
      COMPRAS_FILTERS_STORAGE_KEY,
      JSON.stringify({ typeFilter: 'all', ...filters }),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function ComprasWorkspace(props: { isAdmin: boolean }) {
  const [activeView, setActiveView] = useState<'dashboard' | 'compras'>('dashboard');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | PurchaseType>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | PurchasePriority>('all');
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  // Sem filtro de data no load: pedidos WEG_CONTRATO fora do mês atual também aparecem
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
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
    // Tipo sempre 'all' ao abrir — evita esconder WEG_CONTRATO por filtro antigo no localStorage
    setTypeFilter('all');
    setPriorityFilter(stored.priorityFilter);
    setFiltersHydrated(true);
  }, []);

  useEffect(() => {
    if (!filtersHydrated) return;
    writeStoredFilters({ priorityFilter });
  }, [filtersHydrated, priorityFilter]);

  const clearFilters = useCallback(() => {
    setTypeFilter('all');
    setPriorityFilter('all');
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

        // Tipo/prioridade em ambas as views — inclui WEG_CONTRATO quando Tipo = Todos
        if (typeFilter !== 'all') params.set('type', typeFilter);
        if (priorityFilter !== 'all') params.set('priority', priorityFilter);

        if (activeView === 'compras') {
          const cleanSearch = search.trim();
          if (cleanSearch) params.set('search', cleanSearch);
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
      const index = current.findIndex((row) => row.id === updated.id);
      if (index === -1) return [...current, updated];
      const next = [...current];
      next[index] = updated;
      return next;
    });
  };

  return (
    <div className="erp-module-page flex h-[calc(100dvh-7.5rem)] min-h-0 flex-col px-4 py-4 sm:px-6">
      <header className="mb-4 flex shrink-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
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

          {activeView === 'compras' ? (
            <div className="relative min-w-[min(100%,16rem)] flex-1 sm:max-w-[20rem]">
              <Search className="pointer-events-none absolute left-3 top-1/2 erp-icon-sm -translate-y-1/2 text-[var(--erp-fg-muted)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por item, SKU, produto..."
                className="erp-module-input pl-9"
              />
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <FilterDropdown
            label="Tipo"
            value={typeFilter}
            options={TYPE_FILTER_OPTIONS}
            onChange={(value) => setTypeFilter(value as typeof typeFilter)}
          />

          <FilterDropdown
            label="Prioridade"
            value={priorityFilter}
            options={[
              { value: 'all', label: 'Todas' },
              { value: 'URGENTE', label: 'Urgente' },
              { value: 'NORMAL', label: 'Normal' },
            ]}
            onChange={(value) => setPriorityFilter(value as typeof priorityFilter)}
          />

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="erp-focus-ring erp-btn erp-btn-secondary erp-btn--md shrink-0"
            >
              <X className="erp-icon-sm" />
              Limpar filtros
            </button>
          ) : null}

          <ComprasPeriodFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={handlePeriodChange}
          />

          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="erp-focus-ring erp-btn erp-btn-primary erp-btn--md ml-auto hidden shrink-0 md:inline-flex"
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

function FilterDropdown(props: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected =
    props.options.find((option) => option.value === props.value)?.label ??
    props.value;

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const updatePos = () => {
      if (!btnRef.current) return;
      const rect = btnRef.current.getBoundingClientRect();
      const menuWidth = menuRef.current?.offsetWidth ?? 176;
      const margin = 8;
      let left = rect.left;
      if (left + menuWidth > window.innerWidth - margin) {
        left = Math.max(margin, rect.right - menuWidth);
      }
      setMenuPos({ top: rect.bottom + 6, left });
    };
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    // Evita fechar no mesmo ciclo do clique que abriu.
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointerDown);
      document.addEventListener('keydown', onKeyDown);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const menu =
    open && mounted && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={props.label}
            className="erp-module-card fixed z-[80] min-w-[11rem] py-1 shadow-lg"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            {props.options.map((option) => {
              const active = option.value === props.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    props.onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center px-3 py-2 text-left text-sm transition ${
                    active
                      ? 'bg-[#2AACE2]/12 font-semibold text-[#1E96CC]'
                      : 'text-[var(--erp-fg)] hover:bg-gray-50'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          setOpen((value) => {
            const next = !value;
            if (next && btnRef.current) {
              const rect = btnRef.current.getBoundingClientRect();
              setMenuPos({ top: rect.bottom + 6, left: rect.left });
            }
            return next;
          });
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`erp-focus-ring erp-btn erp-btn-secondary erp-btn--md inline-flex items-center gap-1.5 ${
          props.value !== 'all'
            ? 'border-[color-mix(in_srgb,var(--erp-accent)_40%,transparent)]'
            : ''
        }`}
      >
        <span>
          {props.label}: {selected}
        </span>
        <ChevronDown
          className={`erp-icon-sm transition ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {menu}
    </div>
  );
}
