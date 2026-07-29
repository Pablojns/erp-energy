'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { GlassCard } from '@/src/components/shell/glass-card';
import type { StatusFilterId } from '@/src/components/expedicao/shared/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

type MetricCard = {
  label: string;
  value: number;
  hint: string;
  filter: StatusFilterId;
};

type ExpeditionDashboardDto = {
  totalPedidos: number;
  todayCount: number;
  atrasados: number;
  emSeparacao: number;
  concluidos: number;
  urgentes: number;
  aguardandoEstoque: number;
  aguardandoNf: number;
  parciais: number;
  cancelados: number;
  byStatusLast7Days: Array<{ status: string; count: number }>;
  topUnloadingPoints: Array<{ label: string; value: number }>;
  topReceiversPending: Array<{ name: string; count: number }>;
};

const PIE_COLORS = ['#5b5ef4', '#22c55e', '#f59e0b', '#ef4444', '#38bdf8', '#a78bfa'];

export function ExpeditionDashboardView() {
  const [data, setData] = useState<ExpeditionDashboardDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await erpFetchJson<ExpeditionDashboardDto>(
          'api/pedidos/dashboard',
        );
        if (!cancelled) setData(res);
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

  const topMetrics: MetricCard[] = useMemo(() => {
    if (!data) return [];
    return [
      {
        label: 'Total Pedidos',
        value: data.totalPedidos,
        hint: `${data.todayCount} hoje`,
        filter: 'all',
      },
      {
        label: 'Atrasados',
        value: data.atrasados,
        hint: '⚠ urgente',
        filter: 'atrasado',
      },
      {
        label: 'Em Separação',
        value: data.emSeparacao,
        hint: 'em andamento',
        filter: 'em_separacao',
      },
      {
        label: 'Concluídos',
        value: data.concluidos,
        hint: 'hoje',
        filter: 'finalizado',
      },
      {
        label: 'Urgentes',
        value: data.urgentes,
        hint: 'prioridade alta',
        filter: 'urgente',
      },
    ];
  }, [data]);

  const smallMetrics: MetricCard[] = useMemo(() => {
    if (!data) return [];
    return [
      {
        label: 'Aguardando Estoque',
        value: data.aguardandoEstoque,
        hint: 'com ruptura',
        filter: 'aguardando_estoque',
      },
      {
        label: 'Aguardando NF',
        value: data.aguardandoNf,
        hint: 'pendentes',
        filter: 'aguardando_nf',
      },
      {
        label: 'Parciais',
        value: data.parciais,
        hint: 'em revisão',
        filter: 'parcial',
      },
      {
        label: 'Cancelados',
        value: data.cancelados,
        hint: 'histórico',
        filter: 'cancelado',
      },
    ];
  }, [data]);

  const barSeries = useMemo(() => {
    const rows = data?.byStatusLast7Days ?? [];
    const max = Math.max(...rows.map((x) => x.count), 1);
    return { rows, max };
  }, [data]);

  const pointPie = useMemo(() => {
    const sorted = data?.topUnloadingPoints ?? [];
    const total = sorted.reduce((acc, s) => acc + s.value, 0) || 1;
    let cursor = 0;
    const segments = sorted.map((s, i) => {
      const start = cursor;
      const frac = s.value / total;
      cursor += frac * 100;
      const end = cursor;
      return {
        label: s.label,
        value: s.value,
        color: PIE_COLORS[i % PIE_COLORS.length],
        start,
        end,
      };
    });
    const gradient = `conic-gradient(${segments
      .map((s) => `${s.color} ${s.start}% ${s.end}%`)
      .join(', ')})`;
    return { segments, gradient };
  }, [data]);

  const topReceivers = useMemo(
    () => (data?.topReceiversPending ?? []).map((r) => [r.name, r.count] as const),
    [data],
  );

  if (loading) {
    return (
      <GlassCard className="flex items-center gap-2 p-5 text-sm text-gray-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando dashboard da expedição...
      </GlassCard>
    );
  }

  if (error) {
    return (
      <GlassCard className="p-5 text-sm text-rose-600">
        {error}
      </GlassCard>
    );
  }

  const mUrgentes = topMetrics.find((m) => m.label === 'Urgentes');
  const mParciais = smallMetrics.find((m) => m.label === 'Parciais');
  const mTotal = topMetrics.find((m) => m.label === 'Total Pedidos');
  const mAtrasados = topMetrics.find((m) => m.label === 'Atrasados');
  const mConcluidos = topMetrics.find((m) => m.label === 'Concluídos');
  const mEmSeparacao = topMetrics.find((m) => m.label === 'Em Separação');

  return (
    <div className="space-y-4 px-2 pt-2 sm:px-4 sm:pt-4">
      <div className="exp-dash-mobile-only hidden flex-col gap-2.5">
        <div className="exp-dash-mobile-row1 flex gap-2.5">
          {mUrgentes ? (
            <Link
              href={`/app/expedicao/pedidos?filter=${mUrgentes.filter}`}
              className="exp-dash-mini-card flex-1 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] transition hover:border-[var(--accent)]"
            >
              <p className="exp-dash-mini-label">Urgentes</p>
              <p className="exp-dash-mini-value">{mUrgentes.value}</p>
            </Link>
          ) : null}
          {mParciais ? (
            <Link
              href={`/app/expedicao/pedidos?filter=${mParciais.filter}`}
              className="exp-dash-mini-card flex-1 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] transition hover:border-[var(--accent)]"
            >
              <p className="exp-dash-mini-label">Parciais</p>
              <p className="exp-dash-mini-value">{mParciais.value}</p>
            </Link>
          ) : null}
        </div>
        <div className="exp-dash-mobile-row2 grid grid-cols-2">
          {mTotal ? (
            <Link
              href={`/app/expedicao/pedidos?filter=${mTotal.filter}`}
              className="exp-dash-2x2-card rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] transition hover:border-[var(--accent)]"
            >
              <p className="exp-dash-2x2-label">Total Pedidos</p>
              <p className="exp-dash-2x2-value">{mTotal.value}</p>
            </Link>
          ) : null}
          {mAtrasados ? (
            <Link
              href={`/app/expedicao/pedidos?filter=${mAtrasados.filter}`}
              className="exp-dash-2x2-card rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] transition hover:border-[var(--accent)]"
            >
              <p className="exp-dash-2x2-label">Atrasados</p>
              <p className="exp-dash-2x2-value exp-dash-2x2-value--danger">{mAtrasados.value}</p>
            </Link>
          ) : null}
          {mConcluidos ? (
            <Link
              href={`/app/expedicao/pedidos?filter=${mConcluidos.filter}`}
              className="exp-dash-2x2-card rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] transition hover:border-[var(--accent)]"
            >
              <p className="exp-dash-2x2-label">Concluídos</p>
              <p className="exp-dash-2x2-value">{mConcluidos.value}</p>
            </Link>
          ) : null}
          {mEmSeparacao ? (
            <Link
              href={`/app/expedicao/pedidos?filter=${mEmSeparacao.filter}`}
              className="exp-dash-2x2-card rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] transition hover:border-[var(--accent)]"
            >
              <p className="exp-dash-2x2-label">Em Separação</p>
              <p className="exp-dash-2x2-value">{mEmSeparacao.value}</p>
            </Link>
          ) : null}
        </div>
      </div>

      <div className="exp-dash-desktop-only grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 xl:grid-cols-5">
        {topMetrics.map((m) => (
          <Link
            key={m.label}
            href={`/app/expedicao/pedidos?filter=${m.filter}`}
            className="max-h-20 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3 transition hover:border-[var(--accent)] md:max-h-none md:overflow-visible md:p-4"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">{m.label}</p>
            <p className="mt-1 text-[28px] font-bold leading-none text-[var(--text-primary)] sm:mt-2 sm:text-3xl">{m.value}</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-secondary)] sm:mt-1 sm:text-xs">{m.hint}</p>
          </Link>
        ))}
      </div>

      <div className="exp-dash-desktop-only grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        {smallMetrics.map((m) => (
          <Link
            key={m.label}
            href={`/app/expedicao/pedidos?filter=${m.filter}`}
            className="max-h-20 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3 transition hover:border-[var(--accent)] md:max-h-none md:overflow-visible"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">{m.label}</p>
            <p className="mt-1 text-lg font-bold text-[var(--text-primary)] sm:text-2xl">{m.value}</p>
            <p className="text-[11px] text-[var(--text-secondary)]">{m.hint}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <GlassCard className="exp-dash-desktop-only p-4 xl:col-span-6">
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
