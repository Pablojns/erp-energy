'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Filter, Plus, Search } from 'lucide-react';
import { fetchPurchaseRequests } from './compras-api';
import { ComprasDetailModal } from './compras-detail-modal';
import { ComprasKanbanBoard } from './compras-kanban-board';
import { ComprasNewRequestModal } from './compras-new-request-modal';
import { ComprasResolveModal } from './compras-resolve-modal';
import type { PurchasePriority, PurchaseRequest, PurchaseType } from './compras-types';

export function ComprasWorkspace(props: { isAdmin: boolean }) {
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | PurchaseType>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | PurchasePriority>('all');
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

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('page', '1');
        params.set('pageSize', '100');
        const cleanSearch = search.trim();
        if (cleanSearch) params.set('search', cleanSearch);
        if (typeFilter !== 'all') params.set('type', typeFilter);
        if (priorityFilter !== 'all') params.set('priority', priorityFilter);

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
  }, [priorityFilter, refreshToken, search, typeFilter]);

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

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-0 flex-col px-3 py-3 text-white sm:px-4 lg:px-6">
      <header className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Compras</h1>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:flex-initial">
          <div className="relative min-w-[min(100%,20rem)] flex-1 sm:flex-initial">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por item, SKU, produto..."
              className="h-10 w-full rounded-xl border border-white/10 bg-black/20 pl-9 pr-3 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-400/50"
            />
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setFiltersOpen((value) => !value)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-medium text-white/80 transition hover:bg-white/10"
            >
              <Filter className="h-4 w-4" />
              Filtros
              <ChevronDown className="h-4 w-4" />
            </button>

            {filtersOpen ? (
              <div className="absolute right-0 top-12 z-20 w-[min(92vw,20rem)] rounded-2xl border border-white/10 bg-[#10131c] p-3 shadow-2xl">
                <FilterSelect
                  label="Tipo"
                  value={typeFilter}
                  onChange={(value) => setTypeFilter(value as typeof typeFilter)}
                >
                  <option value="all">Todos</option>
                  <option value="WEG_CONTRATO">WEG</option>
                  <option value="VENDA_EXTERNA">Venda Externa</option>
                  <option value="MARKETPLACE">Marketplace</option>
                </FilterSelect>
                <FilterSelect
                  label="Prioridade"
                  value={priorityFilter}
                  onChange={(value) => setPriorityFilter(value as typeof priorityFilter)}
                >
                  <option value="all">Todas</option>
                  <option value="URGENTE">Urgente</option>
                  <option value="NORMAL">Normal</option>
                </FilterSelect>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Nova Solicitação
          </button>
        </div>
      </header>

      {error ? (
        <div className="mb-3 shrink-0 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <section className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] p-3 shadow-2xl shadow-black/20">
        <ComprasKanbanBoard
          rows={rows}
          loading={loading}
          onOpenCard={(row) => setDetailId(row.id)}
          onStatusChanged={handleStatusChanged}
          onError={setError}
        />
      </section>

      {newOpen ? (
        <ComprasNewRequestModal
          onClose={() => setNewOpen(false)}
          onCreated={() => {
            setNewOpen(false);
            refresh();
          }}
        />
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
      <span className="mb-1 block text-xs font-medium text-white/55">{props.label}</span>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
      >
        {props.children}
      </select>
    </label>
  );
}
