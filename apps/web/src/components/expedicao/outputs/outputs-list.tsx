'use client';

import { useMemo } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { formatBrlDisplay, formatDayDisplay } from '@/src/components/expedicao/expedition-wms-layout';
import type { OrderExitDto, PaginatedOrderExits } from '@/src/components/expedicao/shared/types';
import {
  ErpFilterBar,
  type FilterBadgeItem,
} from '@/src/components/shared/erp-filter-bar';

export type ExitPeriod = 'all' | 'today' | 'week' | 'month';

export const PERIOD_LABEL: Record<ExitPeriod, string> = {
  all: 'Todos',
  today: 'Hoje',
  week: 'Esta semana',
  month: 'Este mês',
};

const EXITS_FILTER_KEY = 'erp.filters.expedicao.saidas';

type ExitsFilterPreset = {
  search: string;
  period: ExitPeriod;
};

function formatOrderNumber(exitItem: OrderExitDto): string {
  return exitItem.order.externalOrderNumber?.trim()
    ? `#${exitItem.order.externalOrderNumber}`
    : exitItem.order.code;
}

function statusLabel(exitItem: OrderExitDto): string {
  if (exitItem.punctuality === 'LATE' && exitItem.delayedDays > 0) {
    return `ATRASADO ${exitItem.delayedDays} dia${exitItem.delayedDays > 1 ? 's' : ''}`;
  }
  return 'NO PRAZO';
}

export function OutputsList(props: {
  search: string;
  onSearchChange: (value: string) => void;
  period: ExitPeriod;
  onPeriodChange: (period: ExitPeriod) => void;
  loading: boolean;
  error: string | null;
  payload: PaginatedOrderExits | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const {
    search,
    onSearchChange,
    period,
    onPeriodChange,
    loading,
    error,
    payload,
    selectedId,
    onSelect,
    page,
    onPageChange,
  } = props;

  const meta = payload?.meta;
  const showingFrom = meta ? (meta.page - 1) * meta.pageSize + 1 : 0;
  const showingTo = meta ? Math.min(meta.page * meta.pageSize, meta.total) : 0;

  const badges = useMemo((): FilterBadgeItem[] => {
    const items: FilterBadgeItem[] = [];
    if (period !== 'all') {
      items.push({ key: 'period', label: PERIOD_LABEL[period] });
    }
    const q = search.trim();
    if (q) items.push({ key: 'search', label: `Busca: ${q}` });
    return items;
  }, [period, search]);

  const hasActiveFilters = badges.length > 0;
  const presetValue = useMemo(
    (): ExitsFilterPreset => ({ search, period }),
    [search, period],
  );

  const handleRemoveBadge = (key: string) => {
    if (key === 'period') onPeriodChange('all');
    if (key === 'search') onSearchChange('');
  };

  const handleClearAll = () => {
    onPeriodChange('all');
    onSearchChange('');
  };

  return (
    <aside className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
      <div className="border-b border-[var(--border-color)] p-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Histórico de Saídas</h2>
        <div className="mt-3">
          <ErpFilterBar<ExitsFilterPreset>
            storageKey={EXITS_FILTER_KEY}
            badges={badges}
            hasActiveFilters={hasActiveFilters}
            onRemoveBadge={handleRemoveBadge}
            onClearAll={handleClearAll}
            presetValue={presetValue}
            onApplyPreset={(preset) => {
              onSearchChange(preset.search);
              onPeriodChange(preset.period);
            }}
            searchSlot={
              <div className="flex min-w-0 flex-1 items-center rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-2.5 erp-filter-search-slot">
                <input
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Buscar por pedido, NF, transportadora..."
                  className="h-10 w-full bg-transparent px-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                />
              </div>
            }
          >
            <div className="erp-filter-option-grid">
              {(Object.keys(PERIOD_LABEL) as ExitPeriod[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onPeriodChange(key)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    period === key
                      ? 'border-transparent bg-[var(--accent)] text-white'
                      : 'border-[var(--border-color)] bg-[var(--input-bg)] text-[var(--text-secondary)]'
                  }`}
                >
                  {PERIOD_LABEL[key]}
                </button>
              ))}
            </div>
          </ErpFilterBar>
        </div>
      </div>

      <div className="max-h-[calc(100vh-300px)] min-h-[220px] overflow-y-auto p-3">
        {loading ? (
          <div className="flex min-h-[160px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
          </div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-[var(--danger)]">{error}</p>
        ) : payload?.data.length ? (
          <div className="space-y-2">
            {payload.data.map((x) => {
              const selectedCard = x.id === selectedId;
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => onSelect(x.id)}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    selectedCard
                      ? 'border-[var(--accent)] bg-[var(--input-bg)]'
                      : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                      {formatOrderNumber(x)}
                    </p>
                    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
                      NF {x.invoiceNumber}
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {formatDayDisplay(x.exitDate)} · {formatBrlDisplay(x.invoiceValue)}
                  </p>
                  <span
                    className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      x.punctuality === 'LATE'
                        ? 'bg-rose-500/15 text-rose-400'
                        : 'bg-emerald-500/15 text-emerald-400'
                    }`}
                  >
                    {statusLabel(x)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-[var(--text-secondary)]">
            Nenhuma saída encontrada.
          </p>
        )}
      </div>

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-between border-t border-[var(--border-color)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          <span>
            {showingFrom}-{showingTo} de {meta.total}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="rounded p-1 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span>
              {page}/{meta.totalPages}
            </span>
            <button
              type="button"
              disabled={page >= meta.totalPages}
              onClick={() => onPageChange(page + 1)}
              className="rounded p-1 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
