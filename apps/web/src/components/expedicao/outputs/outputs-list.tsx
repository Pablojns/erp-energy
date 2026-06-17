'use client';

import { ArrowUpRight, ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { formatBrlDisplay, formatDayDisplay } from '@/src/components/expedicao/expedition-wms-layout';
import type { OrderExitDto, PaginatedOrderExits } from '@/src/components/expedicao/shared/types';

export type ExitPeriod = 'all' | 'today' | 'week' | 'month';

export const PERIOD_LABEL: Record<ExitPeriod, string> = {
  all: 'Todos',
  today: 'Hoje',
  week: 'Esta semana',
  month: 'Este mês',
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

  return (
    <aside className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
      <div className="border-b border-[var(--border-color)] p-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Histórico de Saídas</h2>
        <div className="mt-3 flex items-center rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-2.5">
          <Search className="h-4 w-4 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por pedido, NF, transportadora..."
            className="h-10 w-full bg-transparent px-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
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
                  <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                    {formatBrlDisplay(x.invoiceValue)}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-[var(--text-secondary)]">
                    Saída: {formatDayDisplay(x.exitDate)} {'  '}→{'  '}
                    Prazo: {formatDayDisplay(x.requestedDeliveryDate)}
                  </p>
                  <span
                    className={`mt-2 inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                      x.punctuality === 'LATE'
                        ? 'border-red-400/50 bg-red-500/10 text-red-500'
                        : 'border-emerald-400/50 bg-emerald-500/10 text-emerald-500'
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

      {meta ? (
        <div className="border-t border-[var(--border-color)] p-3">
          <p className="text-center text-xs text-[var(--text-secondary)]">
            Mostrando {showingFrom}-{showingTo} de {meta.total} saídas
          </p>
          <div className="mt-2 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={meta.page <= 1}
              className="rounded-md border border-[var(--border-color)] p-1.5 text-[var(--text-secondary)] disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-[var(--text-secondary)]">
              {meta.page} / {meta.totalPages}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(meta.totalPages, page + 1))}
              disabled={meta.page >= meta.totalPages}
              className="rounded-md border border-[var(--border-color)] p-1.5 text-[var(--text-secondary)] disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
