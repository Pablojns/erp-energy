'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DualMonthlyChart } from '@/src/components/dashboard/dual-monthly-chart';
import { OverviewKpiCard, OverviewKpiCardSkeleton } from '@/src/components/dashboard/overview-kpi-card';
import type {
  DateRange,
  FinanceiroDashboardData,
  MonthlyOrdersPoint,
} from '@/src/components/dashboard/types';
import {
  buildPeriodQuery,
  computeVariationPct,
  fetchDashboardResumo,
  fetchFinanceiroDashboard,
  fetchMonthlyOrdersChart,
  formatCurrency,
  formatDateBr,
  formatPercent,
} from '@/src/components/dashboard/utils';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import '@/src/components/dashboard/overview-executive.css';

type NfAberto = {
  id: string;
  recebedor: string | null;
  valor: number;
  dataEmissao: string;
  diasEmAberto: number;
  status: string;
};

type DespesaRow = {
  id: string;
  descricao: string;
  categoria: string;
  valor: number;
  data: string;
  fornecedor: string | null;
};

type TabFinanceiroProps = {
  period: DateRange;
  refreshKey: number;
};

const CATEGORY_COLORS = [
  '#2563eb',
  '#16a34a',
  '#d97706',
  '#8b5cf6',
  '#dc2626',
  '#0891b2',
];

function CategoryDonut({
  slices,
}: {
  slices: Array<{ label: string; value: number }>;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const size = 96;
  const cx = size / 2;
  const cy = size / 2;
  const r = 34;
  const ri = 22;
  let angle = -Math.PI / 2;

  const arcs = slices.map((slice, i) => {
    const sweep = (slice.value / total) * Math.PI * 2;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(angle + sweep);
    const y2 = cy + r * Math.sin(angle + sweep);
    const xi1 = cx + ri * Math.cos(angle + sweep);
    const yi1 = cy + ri * Math.sin(angle + sweep);
    const xi2 = cx + ri * Math.cos(angle);
    const yi2 = cy + ri * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi1} ${yi1} A ${ri} ${ri} 0 ${large} 0 ${xi2} ${yi2} Z`;
    angle += sweep;
    return { d, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length], slice };
  });

  return (
    <article className="exec-card exec-card--fill flex min-h-0 flex-col p-2.5 md:p-3">
      <h3 className="exec-card-title mb-1 shrink-0">Despesas por Categoria</h3>
      <div className="flex min-h-0 flex-1 items-center justify-center gap-3 overflow-hidden">
        <div className="relative h-[5.5rem] w-[5.5rem] shrink-0">
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="h-full w-full"
            role="img"
            aria-label="Despesas por categoria"
          >
            {slices.length === 0 ? (
              <circle
                cx={cx}
                cy={cy}
                r={(r + ri) / 2}
                fill="none"
                stroke="var(--dash-border)"
                strokeWidth={r - ri}
              />
            ) : (
              arcs.map((a) => (
                <path key={a.slice.label} d={a.d} fill={a.color} stroke="#fff" strokeWidth="1" />
              ))
            )}
          </svg>
        </div>
        <ul className="min-w-0 flex-1 space-y-1 overflow-auto text-[11px]">
          {slices.length === 0 ? (
            <li className="exec-empty">Sem despesas no período.</li>
          ) : (
            slices.map((s, i) => (
              <li key={s.label} className="flex items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-[var(--dash-text-muted)]">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
                  />
                  <span className="truncate">{s.label}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {((s.value / total) * 100).toFixed(1)}%
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </article>
  );
}

export function TabFinanceiro({ period, refreshKey }: TabFinanceiroProps) {
  const [fin, setFin] = useState<FinanceiroDashboardData | null>(null);
  const [ticketMedio, setTicketMedio] = useState(0);
  const [prev, setPrev] = useState<FinanceiroDashboardData | null>(null);
  const [chart, setChart] = useState<MonthlyOrdersPoint[]>([]);
  const [nfs, setNfs] = useState<NfAberto[]>([]);
  const [despesas, setDespesas] = useState<DespesaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const q = buildPeriodQuery(period);

    const chartRangeStart = (() => {
      const now = new Date();
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
    })();
    const chartRangeEnd =
      period.dataFim.trim() || new Date().toISOString().slice(0, 10);
    const despesasChartQ = `?dataInicio=${chartRangeStart}&dataFim=${chartRangeEnd}`;

    const results = await Promise.allSettled([
      fetchFinanceiroDashboard(period),
      fetchDashboardResumo(period),
      fetchMonthlyOrdersChart(period),
      erpFetchJson<{ data: NfAberto[] }>('api/financeiro/nfs-em-aberto?page=1&pageSize=6'),
      erpFetchJson<DespesaRow[]>(`api/financeiro/despesas${q}`),
      erpFetchJson<DespesaRow[]>(`api/financeiro/despesas${despesasChartQ}`),
    ]);

    if (results[0].status === 'fulfilled') setFin(results[0].value);
    else {
      setFin(null);
      setError('Não foi possível carregar o financeiro.');
    }

    if (results[1].status === 'fulfilled') {
      setTicketMedio(Number(results[1].value.financeiro.ticketMedio) || 0);
    }

    const despesasChart =
      results[5].status === 'fulfilled' ? results[5].value ?? [] : [];
    const byMonth = new Map<string, number>();
    for (const d of despesasChart) {
      const key = String(d.data).slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + (Number(d.valor) || 0));
    }

    if (results[2].status === 'fulfilled') {
      setChart(
        results[2].value.map((p) => ({
          ...p,
          value: Number(p.faturado) || Number(p.value) || 0,
          faturado: byMonth.get(p.key) ?? 0,
        })),
      );
    } else setChart([]);

    if (results[3].status === 'fulfilled') setNfs(results[3].value.data ?? []);
    else setNfs([]);

    if (results[4].status === 'fulfilled') setDespesas(results[4].value ?? []);
    else setDespesas([]);

    setLoading(false);
  }, [period.dataInicio, period.dataFim]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!period.dataInicio.trim() || !period.dataFim.trim()) {
      setPrev(null);
      return;
    }
    const [y, m] = period.dataInicio.split('-').map(Number);
    const prevStart = new Date(Date.UTC(y, m - 2, 1));
    const prevEnd = new Date(Date.UTC(y, m - 1, 0));
    const pad = (n: number) => String(n).padStart(2, '0');
    void fetchFinanceiroDashboard({
      dataInicio: `${prevStart.getUTCFullYear()}-${pad(prevStart.getUTCMonth() + 1)}-${pad(prevStart.getUTCDate())}`,
      dataFim: `${prevEnd.getUTCFullYear()}-${pad(prevEnd.getUTCMonth() + 1)}-${pad(prevEnd.getUTCDate())}`,
    })
      .then(setPrev)
      .catch(() => setPrev(null));
  }, [period.dataInicio, period.dataFim]);

  const receitas = Number(fin?.totalPago) || Number(fin?.valorFaturadoPeriodo) || 0;
  const despesasTotal = Number(fin?.despesasMes) || 0;
  const resultado = Number(fin?.lucroBruto) || receitas - despesasTotal;
  const margem = receitas > 0 ? (resultado / receitas) * 100 : 0;
  const faturamento = Number(fin?.valorFaturadoPeriodo) || 0;

  const delta = (current: number, previous: number | null | undefined) =>
    previous == null ? null : computeVariationPct(current, previous);

  const categorySlices = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of despesas) {
      const key = d.categoria?.trim() || 'Outros';
      map.set(key, (map.get(key) ?? 0) + (Number(d.valor) || 0));
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [despesas]);

  const sparkFat = useMemo(
    () => chart.slice(-6).map((p) => Number(p.faturado) || 0),
    [chart],
  );

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
      <div className="exec-overview exec-overview--financeiro">
        {error ? (
          <p className="exec-overview-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="exec-overview-kpis">
          <OverviewKpiCard
            label="Faturamento no Período"
            value={formatCurrency(faturamento)}
            delta={delta(faturamento, prev?.valorFaturadoPeriodo)}
            sparkline={sparkFat}
          />
          <OverviewKpiCard
            label="Receitas Recebidas"
            value={formatCurrency(receitas)}
            delta={delta(receitas, prev?.totalPago)}
            tone="success"
            sparkline={sparkFat}
          />
          <OverviewKpiCard
            label="Despesas Pagas"
            value={formatCurrency(despesasTotal)}
            delta={delta(despesasTotal, prev?.despesasMes)}
            tone="warning"
            sparkline={sparkFat}
          />
          <OverviewKpiCard
            label="Resultado Líquido"
            value={formatCurrency(resultado)}
            delta={delta(resultado, prev?.lucroBruto)}
            tone={resultado >= 0 ? 'success' : 'danger'}
            sparkline={sparkFat}
          />
          <OverviewKpiCard
            label="Margem Líquida"
            value={formatPercent(margem)}
            delta={
              prev
                ? delta(
                    margem,
                    (Number(prev.totalPago) || Number(prev.valorFaturadoPeriodo) || 0) > 0
                      ? ((Number(prev.lucroBruto) || 0) /
                          (Number(prev.totalPago) || Number(prev.valorFaturadoPeriodo) || 1)) *
                        100
                      : 0,
                  )
                : null
            }
            tone={margem >= 20 ? 'success' : 'default'}
            sparkline={sparkFat}
          />
        </div>

        <div className="exec-overview-middle">
          <div className="exec-card exec-card--fill exec-card--chart min-h-0 overflow-hidden p-1">
            <DualMonthlyChart
              points={chart}
              title="Receitas vs Despesas"
              subtitle="Comparativo mensal"
              primaryLabel="Receitas"
              secondaryLabel="Despesas"
              primaryColor="#16a34a"
              secondaryColor="#dc2626"
            />
          </div>

          <article className="exec-card exec-card--fill flex min-h-0 flex-col p-2.5 md:p-3">
            <h3 className="exec-card-title mb-2 shrink-0">Resumo Financeiro</h3>
            <ul className="exec-scroll-list min-h-0 flex-1 space-y-1.5 text-xs">
              {[
                { label: 'Total de Receitas', value: formatCurrency(receitas) },
                { label: 'Total de Despesas', value: formatCurrency(despesasTotal) },
                { label: 'Resultado Líquido', value: formatCurrency(resultado) },
                { label: 'Margem Líquida', value: formatPercent(margem) },
                { label: 'Ticket Médio', value: formatCurrency(ticketMedio) },
                {
                  label: 'Contas a Receber',
                  value: formatCurrency(Number(fin?.totalEmAberto) || 0),
                },
                {
                  label: 'Em Atraso',
                  value: formatCurrency(Number(fin?.totalAtrasado) || 0),
                },
              ].map((row) => (
                <li key={row.label} className="exec-list-row">
                  <span className="exec-list-sub">{row.label}</span>
                  <span className="font-semibold tabular-nums text-[var(--dash-text)]">
                    {row.value}
                  </span>
                </li>
              ))}
            </ul>
          </article>

          <article className="exec-card exec-card--fill flex min-h-0 flex-col p-2.5 md:p-3">
            <h3 className="exec-card-title mb-2 shrink-0">Fluxo de Caixa</h3>
            <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-[var(--dash-text-muted)]">Entradas</span>
                <span className="font-semibold text-[var(--dash-success)]">
                  {formatCurrency(receitas)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[var(--dash-text-muted)]">Saídas</span>
                <span className="font-semibold text-[var(--dash-danger)]">
                  {formatCurrency(despesasTotal)}
                </span>
              </div>
              <div className="mt-1 rounded-lg border border-[#2AACE2]/35 bg-[#2AACE2]/10 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#2AACE2]">
                  Saldo do período
                </p>
                <p className="text-lg font-bold tabular-nums text-[var(--dash-text)]">
                  {formatCurrency(resultado)}
                </p>
              </div>
            </div>
          </article>
        </div>

        <div className="exec-overview-bottom">
          <article className="exec-card exec-card--fill flex min-h-0 flex-col p-2.5">
            <h3 className="exec-card-title mb-1 shrink-0">Contas a Receber</h3>
            <div className="exec-table-wrap min-h-0 flex-1 overflow-auto">
              <table className="exec-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Emissão</th>
                    <th>Valor</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {nfs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="exec-empty">
                        Nenhuma NF em aberto.
                      </td>
                    </tr>
                  ) : (
                    nfs.slice(0, 5).map((nf) => (
                      <tr key={nf.id}>
                        <td>{nf.recebedor || '—'}</td>
                        <td>{formatDateBr(nf.dataEmissao)}</td>
                        <td>{formatCurrency(nf.valor)}</td>
                        <td>
                          <span
                            className={`exec-status ${
                              nf.status === 'ATRASADO'
                                ? 'exec-status--danger'
                                : 'exec-status--neutral'
                            }`}
                          >
                            {nf.status === 'ATRASADO' ? 'Vencido' : 'A Vencer'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="exec-card exec-card--fill flex min-h-0 flex-col p-2.5">
            <h3 className="exec-card-title mb-1 shrink-0">Contas a Pagar</h3>
            <div className="exec-table-wrap min-h-0 flex-1 overflow-auto">
              <table className="exec-table">
                <thead>
                  <tr>
                    <th>Fornecedor</th>
                    <th>Data</th>
                    <th>Valor</th>
                    <th>Cat.</th>
                  </tr>
                </thead>
                <tbody>
                  {despesas.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="exec-empty">
                        Nenhuma despesa no período.
                      </td>
                    </tr>
                  ) : (
                    despesas.slice(0, 5).map((d) => (
                      <tr key={d.id}>
                        <td>{d.fornecedor || d.descricao}</td>
                        <td>{formatDateBr(d.data)}</td>
                        <td>{formatCurrency(d.valor)}</td>
                        <td>{d.categoria}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <CategoryDonut slices={categorySlices} />
        </div>
      </div>
    </div>
  );
}
