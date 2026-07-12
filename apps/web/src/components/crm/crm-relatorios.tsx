'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CRM_RELATORIOS_PERIOD_PRESETS,
  formatCrmDate,
  resolveRelatoriosPeriod,
  type CrmRelatoriosPeriodPreset,
} from '@/src/components/crm/crm-helpers';
import {
  CRM_CARD_ORIGINS,
  CRM_ORIGIN_BADGE_CLASS,
  CRM_ORIGIN_LABEL,
  formatCrmCurrency,
  getCrmRelatorios,
  type CrmCardOrigin,
  type CrmRelatoriosDto,
} from '@/src/services/api/crm-api';
import { CrmMotivosPerdaPieChart } from '@/src/components/crm/crm-motivos-perda-pie';

type ClosedLeadRow = CrmRelatoriosDto['leadsFechados'][number];
type SortKey = keyof ClosedLeadRow;
type SortDir = 'asc' | 'desc';

function formatPercent(value: number) {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function formatDays(value: number) {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
}

function MetricCard(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="erp-module-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--erp-fg-muted)]">
        {props.label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-[var(--erp-fg)]">{props.value}</p>
      {props.hint ? (
        <p className="mt-1 text-xs text-[var(--erp-fg-muted)]">{props.hint}</p>
      ) : null}
    </div>
  );
}

function escapeCsv(value: string | number | null | undefined) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function exportLeadsFechadosCsv(rows: ClosedLeadRow[]) {
  const headers = [
    'Nome',
    'Origem',
    'Canal entrada',
    'Valor',
    'Touchpoints',
    'Ciclo vendas (dias)',
    'Data fechamento',
  ];
  const lines = rows.map((row) =>
    [
      row.name,
      CRM_ORIGIN_LABEL[row.origin],
      row.canalEntrada ?? '',
      row.valor.toFixed(2),
      row.touchpoints,
      row.cicloVendasDias.toFixed(1),
      formatCrmDate(row.dataFechamento),
    ]
      .map(escapeCsv)
      .join(','),
  );
  const blob = new Blob(
    [`\uFEFF${headers.join(',')}\n${lines.join('\n')}`],
    { type: 'text/csv;charset=utf-8;' },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `crm-leads-fechados-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

const FUNNEL_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#94a3b8'];

export function CrmRelatorios() {
  const [periodPreset, setPeriodPreset] =
    useState<CrmRelatoriosPeriodPreset>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [originFilter, setOriginFilter] = useState<CrmCardOrigin | 'TODOS'>('TODOS');
  const [data, setData] = useState<CrmRelatoriosDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('dataFechamento');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const periodRange = useMemo(
    () => resolveRelatoriosPeriod(periodPreset, customStart, customEnd),
    [periodPreset, customStart, customEnd],
  );

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getCrmRelatorios({
          startDate: periodRange.startDate,
          endDate: periodRange.endDate,
          origin: originFilter,
        });
        if (!controller.signal.aborted) setData(result);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setData(null);
          setError(err instanceof Error ? err.message : 'Falha ao carregar relatórios.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [periodRange.startDate, periodRange.endDate, originFilter]);

  const sortedLeadsFechados = useMemo(() => {
    const rows = [...(data?.leadsFechados ?? [])];
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else if (sortKey === 'dataFechamento')
        cmp = new Date(av as string).getTime() - new Date(bv as string).getTime();
      else cmp = String(av ?? '').localeCompare(String(bv ?? ''), 'pt-BR');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [data?.leadsFechados, sortDir, sortKey]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  const resumo = data?.resumo;

  return (
    <section className="erp-module-panel min-h-0 flex-1 overflow-y-auto p-3">
      {/* Seção 1 — Resumo do período */}
      <div className="mb-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--erp-fg)]">
              Resumo do período
            </h3>
            {data ? (
              <p className="mt-0.5 text-xs text-[var(--erp-fg-muted)]">
                {formatCrmDate(data.startDate)} — {formatCrmDate(data.endDate)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={periodPreset}
              onChange={(e) =>
                setPeriodPreset(e.target.value as CrmRelatoriosPeriodPreset)
              }
              className="erp-module-input w-auto min-w-[9rem]"
            >
              {CRM_RELATORIOS_PERIOD_PRESETS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            {periodPreset === 'custom' ? (
              <>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="erp-module-input w-auto"
                />
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="erp-module-input w-auto"
                />
              </>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 7 }).map((_, idx) => (
              <div
                key={idx}
                className="h-24 animate-pulse rounded-xl border border-[var(--erp-border)] bg-[var(--erp-bg-muted)]"
              />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-rose-400">{error}</p>
        ) : resumo ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Total de leads" value={String(resumo.totalLeads)} />
            <MetricCard label="Fechados" value={String(resumo.fechados)} />
            <MetricCard label="Perdidos" value={String(resumo.perdidos)} />
            <MetricCard label="Em negociação" value={String(resumo.emNegociacao)} />
            <MetricCard
              label="Valor total fechado"
              value={formatCrmCurrency(resumo.valorTotalFechado)}
            />
            <MetricCard
              label="Ticket médio"
              value={formatCrmCurrency(resumo.ticketMedio)}
            />
            <MetricCard
              label="Taxa de conversão geral"
              value={formatPercent(resumo.taxaConversaoGeral)}
            />
          </div>
        ) : null}
      </div>

      {!loading && !error && data ? (
        <>
          {/* Seção 2 — Tabela de leads fechados */}
          <div className="erp-module-card mb-4 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--erp-border)] px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--erp-fg)]">
                Leads fechados
              </h3>
              <button
                type="button"
                onClick={() => exportLeadsFechadosCsv(sortedLeadsFechados)}
                disabled={sortedLeadsFechados.length === 0}
                className="erp-focus-ring erp-btn erp-btn-secondary erp-btn--sm disabled:opacity-50"
              >
                <Download className="erp-icon-sm" aria-hidden />
                Exportar CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--erp-border)] text-left text-xs uppercase tracking-wide text-[var(--erp-fg-muted)]">
                    {(
                      [
                        ['name', 'Nome'],
                        ['origin', 'Origem'],
                        ['canalEntrada', 'Canal entrada'],
                        ['valor', 'Valor'],
                        ['touchpoints', 'Touchpoints'],
                        ['cicloVendasDias', 'Ciclo de vendas'],
                        ['dataFechamento', 'Data fechamento'],
                      ] as const
                    ).map(([key, label]) => (
                      <th key={key} className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleSort(key)}
                          className="font-semibold hover:text-[var(--erp-fg)]"
                        >
                          {label}
                          {sortIndicator(key)}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedLeadsFechados.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-[var(--erp-fg-muted)]"
                      >
                        Nenhum lead fechado no período.
                      </td>
                    </tr>
                  ) : (
                    sortedLeadsFechados.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-[var(--erp-border)] last:border-0"
                      >
                        <td className="px-4 py-3 font-medium text-[var(--erp-fg)]">
                          {row.name}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${CRM_ORIGIN_BADGE_CLASS[row.origin]}`}
                          >
                            {CRM_ORIGIN_LABEL[row.origin]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[var(--erp-fg-secondary)]">
                          {row.canalEntrada ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-[var(--erp-fg)]">
                          {formatCrmCurrency(row.valor)}
                        </td>
                        <td className="px-4 py-3 text-[var(--erp-fg-secondary)]">
                          {row.touchpoints}
                        </td>
                        <td className="px-4 py-3 text-[var(--erp-fg-secondary)]">
                          {formatDays(row.cicloVendasDias)}
                        </td>
                        <td className="px-4 py-3 text-[var(--erp-fg-muted)]">
                          {formatCrmDate(row.dataFechamento)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Seção 3 — Performance por origem */}
          <div className="mb-4 grid gap-3 lg:grid-cols-2">
            <CrmMotivosPerdaPieChart data={data.motivosPerdaDistribuicao ?? []} />
          </div>

          <div className="erp-module-card mb-4 overflow-x-auto">
            <h3 className="border-b border-[var(--erp-border)] px-4 py-3 text-sm font-semibold text-[var(--erp-fg)]">
              Performance por origem
            </h3>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--erp-border)] text-left text-xs uppercase tracking-wide text-[var(--erp-fg-muted)]">
                  <th className="px-4 py-3">Origem</th>
                  <th className="px-4 py-3">Leads</th>
                  <th className="px-4 py-3">Fechados</th>
                  <th className="px-4 py-3">Taxa conversão</th>
                  <th className="px-4 py-3">Ticket médio</th>
                  <th className="px-4 py-3">Ciclo médio</th>
                  <th className="px-4 py-3">Touchpoints médios</th>
                </tr>
              </thead>
              <tbody>
                {data.performancePorOrigem.map((row) => (
                  <tr
                    key={row.origin}
                    className="border-b border-[var(--erp-border)] last:border-0"
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${CRM_ORIGIN_BADGE_CLASS[row.origin]}`}
                      >
                        {CRM_ORIGIN_LABEL[row.origin]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--erp-fg)]">{row.leads}</td>
                    <td className="px-4 py-3 text-[var(--erp-fg)]">{row.fechados}</td>
                    <td className="px-4 py-3 text-[var(--erp-fg)]">
                      {formatPercent(row.taxaConversao)}
                    </td>
                    <td className="px-4 py-3 text-[var(--erp-fg)]">
                      {formatCrmCurrency(row.ticketMedio)}
                    </td>
                    <td className="px-4 py-3 text-[var(--erp-fg)]">
                      {formatDays(row.cicloMedioDias)}
                    </td>
                    <td className="px-4 py-3 text-[var(--erp-fg)]">
                      {row.touchpointsMedios.toLocaleString('pt-BR', {
                        maximumFractionDigits: 1,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Seção 4 — Funil de conversão */}
          <div className="erp-module-card mb-4 p-4">
            <h3 className="text-sm font-semibold text-[var(--erp-fg)]">
              Funil de conversão
            </h3>
            <p className="mt-1 text-xs text-[var(--erp-fg-muted)]">
              Leads por status e percentual de queda entre etapas
            </p>
            <div className="mt-4 h-80 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.funilConversao}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis type="number" tick={{ fill: 'var(--erp-fg-muted)', fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="statusName"
                    width={140}
                    tick={{ fill: 'var(--erp-fg-muted)', fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--erp-bg-elevated)',
                      border: '1px solid var(--erp-border)',
                      borderRadius: 12,
                      color: 'var(--erp-fg)',
                    }}
                    formatter={(value, _name, item) => {
                      const drop = item.payload?.dropPercent;
                      const dropLabel =
                        drop != null
                          ? ` · Queda: ${Number(drop).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
                          : '';
                      return [`${value} leads${dropLabel}`, 'Quantidade'];
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {data.funilConversao.map((entry, index) => (
                      <Cell
                        key={entry.statusId}
                        fill={FUNNEL_COLORS[index % FUNNEL_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--erp-fg-muted)]">
                    <th className="px-2 py-1">Status</th>
                    <th className="px-2 py-1">Leads</th>
                    <th className="px-2 py-1">Queda vs etapa anterior</th>
                  </tr>
                </thead>
                <tbody>
                  {data.funilConversao.map((row) => (
                    <tr key={row.statusId} className="border-t border-[var(--erp-border)]">
                      <td className="px-2 py-1.5 text-[var(--erp-fg)]">{row.statusName}</td>
                      <td className="px-2 py-1.5 text-[var(--erp-fg)]">{row.count}</td>
                      <td className="px-2 py-1.5 text-[var(--erp-fg-muted)]">
                        {row.dropPercent != null
                          ? formatPercent(Math.max(0, row.dropPercent))
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Seção 5 — Evolução temporal */}
          <div className="erp-module-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[var(--erp-fg)]">
                  Evolução temporal
                </h3>
                <p className="mt-0.5 text-xs text-[var(--erp-fg-muted)]">
                  Novos leads e fechamentos por{' '}
                  {data.bucketMode === 'month' ? 'mês' : 'semana'}
                </p>
              </div>
              <select
                value={originFilter}
                onChange={(e) =>
                  setOriginFilter(e.target.value as CrmCardOrigin | 'TODOS')
                }
                className="erp-module-input w-auto min-w-[10rem]"
              >
                <option value="TODOS">Todas origens</option>
                {CRM_CARD_ORIGINS.map((origin) => (
                  <option key={origin} value={origin}>
                    {CRM_ORIGIN_LABEL[origin]}
                  </option>
                ))}
              </select>
            </div>
            <div className="h-72 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.evolucaoTemporal}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis
                    dataKey="period"
                    tick={{ fill: 'var(--erp-fg-muted)', fontSize: 11 }}
                  />
                  <YAxis tick={{ fill: 'var(--erp-fg-muted)', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--erp-bg-elevated)',
                      border: '1px solid var(--erp-border)',
                      borderRadius: 12,
                      color: 'var(--erp-fg)',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="novosLeads"
                    name="Novos leads"
                    stroke="#60a5fa"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="fechamentos"
                    name="Fechamentos"
                    stroke="#34d399"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : null}

      {loading && data ? (
        <div className="pointer-events-none fixed bottom-6 right-6 flex items-center gap-2 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-bg-elevated)] px-3 py-2 text-xs text-[var(--erp-fg-muted)] shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin" />
          Atualizando…
        </div>
      ) : null}
    </section>
  );
}
