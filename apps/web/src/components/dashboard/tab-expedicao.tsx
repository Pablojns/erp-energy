'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { OverviewKpiCard, OverviewKpiCardSkeleton } from '@/src/components/dashboard/overview-kpi-card';
import { StatusBarChart } from '@/src/components/dashboard/status-bar-chart';
import type { DashboardResumo, DateRange } from '@/src/components/dashboard/types';
import {
  computeVariationPct,
  fetchDashboardResumo,
  formatCurrency,
  formatDateBr,
  formatNumber,
  formatPercent,
} from '@/src/components/dashboard/utils';
import { getOverdueDays } from '@/src/components/expedicao/shared/order-helpers';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import {
  normalizePedidoFromApi,
  pedidosListFetchInit,
} from '@/src/services/api/pedidos-normalize';
import '@/src/components/dashboard/overview-executive.css';

type OrderRow = {
  id: string;
  code: string;
  customer: string;
  date: string;
  daysLate?: number;
  total: number;
  status: string;
};

type TabExpedicaoProps = {
  period: DateRange;
  refreshKey: number;
};

function ProgressDonut({ finalized, total }: { finalized: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((finalized / total) * 100)) : 0;
  const pending = Math.max(0, total - finalized);
  const size = 160;
  const r = 58;
  const c = 2 * Math.PI * r;
  const done = (pct / 100) * c;

  return (
    <article className="exec-card exec-card--fill flex min-h-0 flex-col p-2.5 md:p-3">
      <h3 className="exec-card-title shrink-0">Progresso de Finalização</h3>
      <div className="flex min-h-0 flex-1 items-center justify-center gap-3 overflow-hidden">
        <div className="relative shrink-0">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="var(--dash-border)"
              strokeWidth={14}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="#16a34a"
              strokeWidth={14}
              strokeLinecap="round"
              strokeDasharray={`${done} ${c - done}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold tabular-nums text-[var(--dash-text)]">{pct}%</span>
            <span className="text-[10px] font-semibold uppercase text-[var(--dash-text-muted)]">
              Finalizados
            </span>
          </div>
        </div>
        <ul className="min-w-0 space-y-2 text-xs">
          <li className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-[var(--dash-text-muted)]">
              <span className="h-2 w-2 rounded-full bg-[#16a34a]" />
              Finalizados
            </span>
            <span className="font-semibold tabular-nums">
              {formatNumber(finalized)} · {pct}%
            </span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-[var(--dash-text-muted)]">
              <span className="h-2 w-2 rounded-full bg-slate-300" />
              Pendentes
            </span>
            <span className="font-semibold tabular-nums">
              {formatNumber(pending)} · {total > 0 ? Math.round((pending / total) * 100) : 0}%
            </span>
          </li>
        </ul>
      </div>
    </article>
  );
}

export function TabExpedicao({ period, refreshKey }: TabExpedicaoProps) {
  const [resumo, setResumo] = useState<DashboardResumo | null>(null);
  const [prevTotal, setPrevTotal] = useState<number | null>(null);
  const [delayed, setDelayed] = useState<OrderRow[]>([]);
  const [awaitingNf, setAwaitingNf] = useState<OrderRow[]>([]);
  const [finalized, setFinalized] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const mapOrder = (raw: Record<string, unknown>): OrderRow => {
      const p = normalizePedidoFromApi(raw);
      return {
        id: p.id,
        code: p.externalOrderNumber ?? p.code,
        customer: p.customerName ?? p.receiverName ?? '—',
        date: p.createdAt ?? '',
        daysLate: getOverdueDays(p) ?? undefined,
        total: Number(p.totalValue) || 0,
        status: String(p.status ?? ''),
      };
    };

    const results = await Promise.allSettled([
      fetchDashboardResumo(period),
      erpFetchJson<{ data: Record<string, unknown>[] }>(
        'api/pedidos?status=delayed&pageSize=6&page=1&sortBy=requestedDeliveryDate&sortOrder=asc',
        pedidosListFetchInit,
      ),
      erpFetchJson<{ data: Record<string, unknown>[] }>(
        'api/pedidos?status=AGUARDANDO_NF&pageSize=6&page=1&sortBy=createdAt&sortOrder=desc',
        pedidosListFetchInit,
      ),
      erpFetchJson<{ data: Record<string, unknown>[] }>(
        'api/pedidos?status=FINALIZADO&pageSize=6&page=1&sortBy=createdAt&sortOrder=desc',
        pedidosListFetchInit,
      ),
    ]);

    if (results[0].status === 'fulfilled') setResumo(results[0].value);
    else {
      setResumo(null);
      setError('Não foi possível carregar o resumo de expedição.');
    }

    if (results[1].status === 'fulfilled') {
      setDelayed(results[1].value.data.map(mapOrder).slice(0, 5));
    } else setDelayed([]);

    if (results[2].status === 'fulfilled') {
      setAwaitingNf(results[2].value.data.map(mapOrder).slice(0, 5));
    } else setAwaitingNf([]);

    if (results[3].status === 'fulfilled') {
      setFinalized(results[3].value.data.map(mapOrder).slice(0, 5));
    } else setFinalized([]);

    setLoading(false);
  }, [period.dataInicio, period.dataFim]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!period.dataInicio.trim() || !period.dataFim.trim()) {
      setPrevTotal(null);
      return;
    }
    const [y, m] = period.dataInicio.split('-').map(Number);
    const prevStart = new Date(Date.UTC(y, m - 2, 1));
    const prevEnd = new Date(Date.UTC(y, m - 1, 0));
    const pad = (n: number) => String(n).padStart(2, '0');
    void fetchDashboardResumo({
      dataInicio: `${prevStart.getUTCFullYear()}-${pad(prevStart.getUTCMonth() + 1)}-${pad(prevStart.getUTCDate())}`,
      dataFim: `${prevEnd.getUTCFullYear()}-${pad(prevEnd.getUTCMonth() + 1)}-${pad(prevEnd.getUTCDate())}`,
    })
      .then((r) => setPrevTotal(Number(r.financeiro.totalPedidosMes) || 0))
      .catch(() => setPrevTotal(null));
  }, [period.dataInicio, period.dataFim]);

  const f = resumo?.financeiro;
  const fluxo = resumo?.fluxo;
  const total = Number(f?.totalPedidosMes) || 0;
  const atrasados = Number(f?.pedidosAtrasados) || 0;
  const concluidos = Number(f?.pedidosConcluidos) || 0;
  const emSep = Number(fluxo?.EM_SEPARACAO) || 0;
  const aguardNf = Number(fluxo?.AGUARDANDO_NF) || 0;
  const totalDelta =
    prevTotal != null ? computeVariationPct(total, prevTotal) : null;

  const spark = useMemo(() => [total * 0.7, total * 0.85, total * 0.9, total], [total]);

  if (loading) {
    return (
      <div className="dash-overview-panel">
        <div className="exec-overview">
          <div className="exec-overview-kpis">
            {Array.from({ length: 5 }).map((_, i) => (
              <OverviewKpiCardSkeleton key={i} />
            ))}
          </div>
          <div className="exec-overview-middle">
            <div className="exec-card dash-skeleton min-h-[160px]" />
            <div className="exec-card dash-skeleton min-h-[160px]" />
            <div className="exec-card dash-skeleton min-h-[160px]" />
          </div>
          <div className="exec-overview-bottom">
            <div className="exec-card dash-skeleton min-h-[140px]" />
            <div className="exec-card dash-skeleton min-h-[140px]" />
            <div className="exec-card dash-skeleton min-h-[140px]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-overview-panel">
      <div className="exec-overview exec-overview--expedicao">
        {error ? (
          <p className="exec-overview-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="exec-overview-kpis">
          <OverviewKpiCard
            label="Total de Pedidos"
            value={formatNumber(total)}
            delta={totalDelta}
            sparkline={spark}
          />
          <OverviewKpiCard
            label="Atrasados"
            value={formatNumber(atrasados)}
            tone={atrasados > 0 ? 'danger' : 'default'}
            sparkline={spark}
          />
          <OverviewKpiCard
            label="Em Separação"
            value={formatNumber(emSep)}
            sparkline={spark}
          />
          <OverviewKpiCard
            label="Aguardando NF"
            value={formatNumber(aguardNf)}
            tone={aguardNf > 0 ? 'warning' : 'default'}
            sparkline={spark}
          />
          <OverviewKpiCard
            label="Finalizados"
            value={formatNumber(concluidos)}
            tone="success"
            sparkline={spark}
          />
        </div>

        <div className="exec-overview-middle">
          <div className="exec-card exec-card--fill exec-card--chart min-h-0 overflow-hidden p-1">
            {fluxo ? (
              <StatusBarChart fluxo={fluxo} />
            ) : (
              <p className="exec-empty p-3">Dados de status indisponíveis.</p>
            )}
          </div>

          <ProgressDonut finalized={concluidos} total={total} />

          <article className="exec-card exec-card--fill flex min-h-0 flex-col p-2.5 md:p-3">
            <h3 className="exec-card-title mb-2 shrink-0">Alertas e Pendências</h3>
            <ul className="exec-scroll-list min-h-0 flex-1 space-y-1">
              {[
                { label: 'Pedidos Atrasados', value: atrasados, tone: 'danger' as const },
                { label: 'Aguardando NF', value: aguardNf, tone: 'warning' as const },
                { label: 'Separação Pendente', value: emSep, tone: 'neutral' as const },
                {
                  label: 'Prontos para Envio',
                  value: Number(fluxo?.PARCIAL) || 0,
                  tone: 'success' as const,
                },
              ].map((item) => (
                <li key={item.label} className="exec-list-row">
                  <div className="min-w-0">
                    <p className="exec-list-title">{item.label}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`exec-status exec-status--${item.tone === 'neutral' ? 'neutral' : item.tone}`}>
                      {formatNumber(item.value)}
                    </span>
                    <Link href="/app/expedicao" className="dash-tab-link text-[10px]">
                      Ver todos
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </div>

        <div className="exec-overview-bottom exec-exp-bottom">
          <article className="exec-card exec-card--fill flex min-h-0 flex-col p-2.5">
            <div className="mb-1 flex shrink-0 items-center justify-between gap-2">
              <h3 className="exec-card-title">
                Pedidos Atrasados
                <span className="exec-badge exec-badge--danger">{atrasados}</span>
              </h3>
            </div>
            <div className="exec-table-wrap min-h-0 flex-1 overflow-auto">
              <table className="exec-table">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Dias</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {delayed.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="exec-empty">
                        Nenhum pedido atrasado.
                      </td>
                    </tr>
                  ) : (
                    delayed.map((row) => (
                      <tr key={row.id}>
                        <td className="font-semibold text-[#2AACE2]">{row.code}</td>
                        <td>{row.customer}</td>
                        <td>
                          <span className="exec-status exec-status--danger">
                            {formatNumber(row.daysLate ?? 0)}d
                          </span>
                        </td>
                        <td>{formatCurrency(row.total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="exec-card exec-card--fill flex min-h-0 flex-col p-2.5">
            <h3 className="exec-card-title mb-1 shrink-0">
              Pedidos Aguardando NF
              <span className="exec-badge">{aguardNf}</span>
            </h3>
            <div className="exec-table-wrap min-h-0 flex-1 overflow-auto">
              {awaitingNf.length === 0 ? (
                <p className="exec-empty">Nenhum pedido aguardando NF.</p>
              ) : (
                <table className="exec-table">
                  <thead>
                    <tr>
                      <th>Pedido</th>
                      <th>Cliente</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {awaitingNf.map((row) => (
                      <tr key={row.id}>
                        <td className="font-semibold text-[#2AACE2]">{row.code}</td>
                        <td>{row.customer}</td>
                        <td>{formatCurrency(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </article>

          <article className="exec-card exec-card--fill flex min-h-0 flex-col p-2.5">
            <h3 className="exec-card-title mb-1 shrink-0">Últimos Finalizados</h3>
            <div className="exec-table-wrap min-h-0 flex-1 overflow-auto">
              <table className="exec-table">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Data</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {finalized.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="exec-empty">
                        Nenhum finalizado recente.
                      </td>
                    </tr>
                  ) : (
                    finalized.map((row) => (
                      <tr key={row.id}>
                        <td className="font-semibold text-[#2AACE2]">{row.code}</td>
                        <td>{row.customer}</td>
                        <td>{formatDateBr(row.date)}</td>
                        <td>{formatCurrency(row.total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </div>

        <div className="exec-exp-foot-kpis">
          <OverviewKpiCard
            label="Taxa de Entrega no Prazo"
            value={formatPercent(100 - (Number(f?.taxaSLA) || 0))}
            tone="success"
            sparkline={spark}
          />
          <OverviewKpiCard
            label="Pedidos no Período"
            value={formatNumber(total)}
            sparkline={spark}
          />
          <OverviewKpiCard
            label="Taxa SLA (atraso)"
            value={formatPercent(Number(f?.taxaSLA) || 0)}
            tone={(Number(f?.taxaSLA) || 0) > 10 ? 'danger' : 'default'}
            sparkline={spark}
          />
          <OverviewKpiCard
            label="Ticket Médio"
            value={formatCurrency(Number(f?.ticketMedio) || 0)}
            sparkline={spark}
          />
        </div>
      </div>
    </div>
  );
}
