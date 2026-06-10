'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Loader2, Search, Truck } from 'lucide-react';
import { formatBrlDisplay, formatDayDisplay } from '@/src/components/expedicao/expedition-wms-layout';
import type {
  OrderExitDto,
  PaginatedOrderExits,
} from '@/src/components/expedicao/shared/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

type ExitPeriod = 'all' | 'today' | 'week' | 'month';

const PERIOD_LABEL: Record<ExitPeriod, string> = {
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

function itemStatus(it: { pickedQty: number; quantity: number }) {
  if (it.pickedQty >= it.quantity && it.quantity > 0) {
    return { label: '✓ EMBALADO', tone: 'ok' as const };
  }
  if (it.pickedQty > 0) {
    return { label: '~ PARCIAL', tone: 'warn' as const };
  }
  return { label: 'PENDENTE', tone: 'pending' as const };
}

export function ExitsPage() {
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [period, setPeriod] = useState<ExitPeriod>('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<PaginatedOrderExits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [searchDebounced, period]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void erpFetchJson<PaginatedOrderExits>(
      `api/pedidos/saidas?search=${encodeURIComponent(searchDebounced)}&period=${period}&page=${page}&pageSize=25`,
    )
      .then((res) => {
        if (cancelled) return;
        setPayload(res);
      })
      .catch((e) => {
        if (cancelled) return;
        setPayload(null);
        setError(e instanceof Error ? e.message : 'Falha ao carregar saídas.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchDebounced, period, page]);

  useEffect(() => {
    if (!payload?.data?.length) {
      setSelectedId(null);
      return;
    }
    if (selectedId && payload.data.some((x) => x.id === selectedId)) return;
    setSelectedId(payload.data[0].id);
  }, [payload, selectedId]);

  const selected = useMemo(
    () => payload?.data.find((x) => x.id === selectedId) ?? null,
    [payload, selectedId],
  );

  const meta = payload?.meta;
  const showingFrom = meta ? (meta.page - 1) * meta.pageSize + 1 : 0;
  const showingTo = meta ? Math.min(meta.page * meta.pageSize, meta.total) : 0;

  return (
    <div className="flex h-full w-full flex-col gap-4 px-4 pt-4">
      <div className="grid h-full w-full grid-cols-1 gap-4 lg:grid-cols-[40fr_60fr]">
        <aside className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
          <div className="border-b border-[var(--border-color)] p-3">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Histórico de Saídas</h2>
            <div className="mt-3 flex items-center rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-2.5">
              <Search className="h-4 w-4 text-[var(--text-muted)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por pedido, NF, transportadora..."
                className="h-10 w-full bg-transparent px-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(Object.keys(PERIOD_LABEL) as ExitPeriod[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriod(key)}
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
                      onClick={() => setSelectedId(x.id)}
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
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                  onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                  disabled={meta.page >= meta.totalPages}
                  className="rounded-md border border-[var(--border-color)] p-1.5 text-[var(--text-secondary)] disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}
        </aside>

        <section className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
          {!selected ? (
            <div className="flex h-full min-h-[260px] items-center justify-center text-sm text-[var(--text-secondary)]">
              Selecione uma saída para visualizar os detalhes.
            </div>
          ) : (
            <div className="space-y-4">
              <header className="rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-[var(--text-primary)]">
                    {formatOrderNumber(selected)}
                  </p>
                  <p className="text-base font-semibold text-[var(--text-primary)]">
                    {formatBrlDisplay(selected.invoiceValue)}
                  </p>
                  <span
                    className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                      selected.punctuality === 'LATE'
                        ? 'border-red-400/50 bg-red-500/10 text-red-500'
                        : 'border-emerald-400/50 bg-emerald-500/10 text-emerald-500'
                    }`}
                  >
                    {statusLabel(selected)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">NF: {selected.invoiceNumber}</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Saída: {formatDayDisplay(selected.exitDate)} {'  '}|{'  '}
                  Prazo WEG: {formatDayDisplay(selected.requestedDeliveryDate)}
                </p>
              </header>

              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] p-3">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1 md:pr-4 md:border-r md:border-[var(--border-color)]">
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                      Comprador
                    </p>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {selected.order.customerName}
                      {selected.order.customerDocument ? ` (${selected.order.customerDocument})` : ''}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Ponto: <span className="text-[var(--text-primary)]">{selected.order.unloadingPoint ?? '—'}</span>
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Recebedor:{' '}
                      <span className="text-[var(--text-primary)]">{selected.order.receiverName ?? '—'}</span>
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                      Endereço de Entrega
                    </p>
                    {selected.order.deliveryAddress ? (
                      <>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{selected.order.deliveryAddress}</p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          <span className="text-[var(--text-primary)]">{selected.order.deliveryCity ?? '—'}</span>/
                          <span className="text-[var(--text-primary)]">{selected.order.deliveryState ?? '—'}</span>
                        </p>
                      </>
                    ) : (
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        Ponto de descarga: {selected.order.unloadingPoint ?? '—'}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] p-3">
                <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                  <Truck className="h-4 w-4" /> Transportadora
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                  {selected.carrierName ?? '—'}
                </p>
                <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                  Rastreio
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                  {selected.trackingCode ?? 'A configurar'}
                </p>
              </div>

              <div className="overflow-x-auto rounded-lg border border-[var(--border-color)]">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="bg-[var(--input-bg)]">
                      {['LINHA', 'SKU', 'ITEM (DESCRIÇÃO)', 'QTD. PEDIDA', 'STATUS', 'OBSERVAÇÃO'].map((h) => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.order.items.map((it) => {
                      const st = itemStatus(it);
                      return (
                        <tr key={it.id} className="border-t border-[var(--border-color)]">
                          <td className="px-3 py-2 text-xs text-[var(--text-primary)]">{it.lineNumber}</td>
                          <td className="px-3 py-2 text-xs font-mono text-[var(--text-primary)]">{it.sku}</td>
                          <td className="px-3 py-2 text-xs text-[var(--text-primary)]">{it.description}</td>
                          <td className="px-3 py-2 text-xs text-[var(--text-primary)]">{it.quantity}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                                st.tone === 'ok'
                                  ? 'border-emerald-400/50 bg-emerald-500/10 text-emerald-500'
                                  : st.tone === 'warn'
                                    ? 'border-amber-400/50 bg-amber-500/10 text-amber-500'
                                    : 'border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)]'
                              }`}
                            >
                              {st.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                            {st.tone === 'ok'
                              ? 'Item conferido na saída'
                              : st.tone === 'warn'
                                ? 'Conferir divergência parcial'
                                : 'Item sem separação'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
