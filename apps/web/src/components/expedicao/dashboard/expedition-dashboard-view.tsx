'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { GlassCard } from '@/src/components/shell/glass-card';
import { isOrderOverdue, orderMatchesParcialFilter } from '@/src/components/expedicao/shared/order-helpers';
import type { OrderDto, PaginatedOrders, StatusFilterId } from '@/src/components/expedicao/shared/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { pedidosListFetchInit } from '@/src/services/api/pedidos-normalize';

type MetricCard = {
  label: string;
  value: number;
  hint: string;
  filter: StatusFilterId;
};

const PIE_COLORS = ['#5b5ef4', '#22c55e', '#f59e0b', '#ef4444', '#38bdf8', '#a78bfa'];

export function ExpeditionDashboardView() {
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const acc: OrderDto[] = [];
        let page = 1;
        let totalPages = 1;
        do {
          const res = await erpFetchJson<PaginatedOrders>(
            `api/pedidos?page=${page}&pageSize=50&status=all&sortBy=orderDate&sortOrder=desc`,
            pedidosListFetchInit,
          );
          acc.push(...res.data);
          totalPages = res.meta.totalPages;
          page += 1;
        } while (page <= totalPages);
        if (!cancelled) setOrders(acc);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Falha ao carregar dashboard.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const todayCount = useMemo(() => {
    const now = new Date();
    return orders.filter((o) => {
      const d = new Date(o.orderDate ?? o.createdAt);
      return (
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      );
    }).length;
  }, [orders]);

  const topMetrics: MetricCard[] = useMemo(
    () => [
      { label: 'Total Pedidos', value: orders.length, hint: `${todayCount} hoje`, filter: 'all' },
      {
        label: 'Atrasados',
        value: orders.filter(isOrderOverdue).length,
        hint: '⚠ urgente',
        filter: 'atrasado',
      },
      {
        label: 'Em Separação',
        value: orders.filter((o) => o.status === 'EM_SEPARACAO').length,
        hint: 'em andamento',
        filter: 'em_separacao',
      },
      {
        label: 'Concluídos',
        value: orders.filter((o) => o.status === 'FINALIZADO' || o.status === 'EXPEDIDO').length,
        hint: 'hoje',
        filter: 'finalizado',
      },
      {
        label: 'Urgentes',
        value: orders.filter((o) => o.priority <= 2).length,
        hint: 'prioridade alta',
        filter: 'urgente',
      },
    ],
    [orders, todayCount],
  );

  const smallMetrics: MetricCard[] = useMemo(
    () => [
      {
        label: 'Aguardando Estoque',
        value: orders.filter((o) => (o.unidadesFaltantes ?? 0) > 0).length,
        hint: 'com ruptura',
        filter: 'aguardando_estoque',
      },
      {
        label: 'Aguardando NF',
        value: orders.filter((o) => o.status === 'AGUARDANDO_NF' || o.status === 'NF_ATRELADA').length,
        hint: 'pendentes',
        filter: 'aguardando_nf',
      },
      {
        label: 'Parciais',
        value: orders.filter((o) => orderMatchesParcialFilter(o)).length,
        hint: 'em revisão',
        filter: 'parcial',
      },
      {
        label: 'Cancelados',
        value: orders.filter((o) => o.status === 'CANCELADO').length,
        hint: 'histórico',
        filter: 'cancelado',
      },
    ],
    [orders],
  );

  const barSeries = useMemo(() => {
    const from = new Date();
    from.setDate(from.getDate() - 7);
    const statuses = ['NOVO', 'PARCIAL', 'EM_SEPARACAO', 'AGUARDANDO_NF', 'FINALIZADO', 'CANCELADO'] as const;
    const rows = statuses.map((status) => ({
      status,
      count: orders.filter((o) => {
        const d = new Date(o.orderDate ?? o.createdAt);
        return d >= from && o.status === status;
      }).length,
    }));
    const max = Math.max(...rows.map((x) => x.count), 1);
    return { rows, max };
  }, [orders]);

  const pointPie = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of orders) {
      const key = o.unloadingPoint?.trim() || 'Sem ponto';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const total = sorted.reduce((acc, [, n]) => acc + n, 0) || 1;
    let cursor = 0;
    const segments = sorted.map(([label, value], i) => {
      const start = cursor;
      const frac = value / total;
      cursor += frac * 100;
      const end = cursor;
      return { label, value, color: PIE_COLORS[i % PIE_COLORS.length], start, end };
    });
    const gradient = `conic-gradient(${segments
      .map((s) => `${s.color} ${s.start}% ${s.end}%`)
      .join(', ')})`;
    return { segments, gradient };
  }, [orders]);

  const topReceivers = useMemo(() => {
    const pending = orders.filter((o) => o.status !== 'FINALIZADO' && o.status !== 'CANCELADO');
    const map = new Map<string, number>();
    for (const o of pending) {
      const key = o.receiverName?.trim() || 'Sem recebedor';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [orders]);

  if (loading) {
    return (
      <GlassCard className="flex items-center gap-2 p-5 text-sm text-zinc-300">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando dashboard da expedição...
      </GlassCard>
    );
  }

  if (error) {
    return (
      <GlassCard className="p-5 text-sm text-rose-300">
        {error}
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4 px-2 pt-2 sm:px-4 sm:pt-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {topMetrics.map((m) => (
          <Link
            key={m.label}
            href={`/app/expedicao/pedidos?filter=${m.filter}`}
            className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 transition hover:border-[var(--accent)]"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">{m.label}</p>
            <p className="mt-2 text-xl font-bold text-[var(--text-primary)] sm:text-3xl">{m.value}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{m.hint}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {smallMetrics.map((m) => (
          <Link
            key={m.label}
            href={`/app/expedicao/pedidos?filter=${m.filter}`}
            className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3 transition hover:border-[var(--accent)]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">{m.label}</p>
            <p className="mt-1 text-lg font-bold text-[var(--text-primary)] sm:text-2xl">{m.value}</p>
            <p className="text-[11px] text-[var(--text-secondary)]">{m.hint}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <GlassCard className="p-4 xl:col-span-6">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Pedidos por status (7 dias)</h3>
          <div className="mt-4 space-y-2">
            {barSeries.rows.map((r) => (
              <div key={r.status}>
                <div className="mb-1 flex items-center justify-between text-xs text-[var(--text-secondary)]">
                  <span>{r.status}</span>
                  <span>{r.count}</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--badge-bg)]">
                  <div
                    className="h-2 rounded-full bg-[var(--accent)]"
                    style={{ width: `${(r.count / barSeries.max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-4 xl:col-span-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Distribuição por ponto</h3>
          <div className="mt-4 flex items-center gap-4">
            <div
              className="h-28 w-28 rounded-full border border-[var(--border-color)]"
              style={{ background: pointPie.gradient }}
            />
            <div className="space-y-1 text-xs text-[var(--text-secondary)]">
              {pointPie.segments.map((s) => (
                <p key={s.label} className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                  <span className="truncate">{s.label}</span>
                  <span className="text-[var(--text-primary)]">{s.value}</span>
                </p>
              ))}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-4 xl:col-span-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Top 5 recebedores pendentes</h3>
          <div className="mt-3 space-y-2">
            {topReceivers.map(([name, count]) => (
              <div key={name} className="flex items-center justify-between rounded-lg border border-[var(--border-color)] px-3 py-2">
                <span className="truncate text-sm text-[var(--text-primary)]">{name}</span>
                <span className="text-sm font-semibold text-[var(--text-primary)]">{count}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
