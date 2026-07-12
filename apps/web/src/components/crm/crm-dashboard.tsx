'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CRM_DASHBOARD_PERIODS,
  crmMetaProgressColor,
  type CrmDashboardPeriod,
} from '@/src/components/crm/crm-helpers';
import { CrmMotivosPerdaPieChart } from '@/src/components/crm/crm-motivos-perda-pie';
import {
  CRM_CARD_ORIGINS,
  CRM_ORIGIN_BADGE_CLASS,
  CRM_ORIGIN_LABEL,
  formatCrmCurrency,
  type CrmCardOrigin,
  type CrmDashboardDto,
  type CrmMetasMesDto,
} from '@/src/services/api/crm-api';

function formatPercent(value: number) {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function formatDays(value: number) {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
}

function MetricCard(props: {
  label: string;
  value: string;
  hint?: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`erp-module-card p-4 ${props.alert ? 'ring-1 ring-rose-500/40' : ''}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--erp-fg-muted)]">
        {props.label}
      </p>
      <p
        className={`mt-2 text-2xl font-semibold ${
          props.alert ? 'text-rose-300' : 'text-[var(--erp-fg)]'
        }`}
      >
        {props.value}
      </p>
      {props.hint ? (
        <p className="mt-1 text-xs text-[var(--erp-fg-muted)]">{props.hint}</p>
      ) : null}
    </div>
  );
}

function OriginGroupedChart(props: { porOrigem: CrmDashboardDto['porOrigem'] }) {
  const chartData = props.porOrigem.map((row) => ({
    origin: CRM_ORIGIN_LABEL[row.origin],
    leads: row.leads,
    fechados: row.fechados,
    taxa: Number(row.taxaLeadFechado.toFixed(1)),
    ticket: Number(row.ticketMedio.toFixed(2)),
  }));

  return (
    <div className="erp-module-card p-4 lg:col-span-3">
      <h3 className="text-sm font-semibold text-[var(--erp-fg)]">
        Comparativo por origem
      </h3>
      <p className="mt-1 text-xs text-[var(--erp-fg-muted)]">
        Leads, fechados, taxa de conversão (%) e ticket médio (R$)
      </p>
      <div className="mt-4 h-72 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis
              dataKey="origin"
              tick={{ fill: 'var(--erp-fg-muted)', fontSize: 12 }}
            />
            <YAxis yAxisId="left" tick={{ fill: 'var(--erp-fg-muted)', fontSize: 11 }} />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: 'var(--erp-fg-muted)', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--erp-bg-elevated)',
                border: '1px solid var(--erp-border)',
                borderRadius: 12,
                color: 'var(--erp-fg)',
              }}
              formatter={(value, name) => {
                const v = Number(value ?? 0);
                if (name === 'taxa') return [`${v.toLocaleString('pt-BR')}%`, 'Taxa conversão'];
                if (name === 'ticket') return [formatCrmCurrency(v), 'Ticket médio'];
                if (name === 'fechados') return [v, 'Fechados'];
                return [v, 'Leads'];
              }}
            />
            <Legend />
            <Bar
              yAxisId="left"
              dataKey="leads"
              name="Leads"
              fill="#60a5fa"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              yAxisId="left"
              dataKey="fechados"
              name="Fechados"
              fill="#34d399"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              yAxisId="right"
              dataKey="taxa"
              name="Taxa conversão"
              fill="#fbbf24"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              yAxisId="right"
              dataKey="ticket"
              name="Ticket médio"
              fill="#a78bfa"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MetaProgressBar(props: {
  label: string;
  atual: number;
  meta: number;
  percent: number;
  formatAtual: (value: number) => string;
  formatMeta: (value: number) => string;
}) {
  const width = `${Math.min(100, Math.max(0, props.percent))}%`;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-[var(--erp-fg)]">{props.label}</span>
        <span className="text-[var(--erp-fg-muted)]">
          {props.formatAtual(props.atual)} / {props.formatMeta(props.meta)} (
          {props.percent.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full rounded-full transition-all ${crmMetaProgressColor(props.percent)}`}
          style={{ width }}
        />
      </div>
    </div>
  );
}

function MetasDoMesSection(props: {
  metas: CrmMetasMesDto | null | undefined;
  isAdmin: boolean;
  onEditMetas: () => void;
}) {
  if (!props.metas) return null;
  const { metas } = props;

  return (
    <div className="erp-module-card mb-4 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--erp-fg)]">Metas do Mês</h3>
          <p className="text-xs text-[var(--erp-fg-muted)]">
            {String(metas.mes).padStart(2, '0')}/{metas.ano}
          </p>
        </div>
        {props.isAdmin ? (
          <button
            type="button"
            onClick={props.onEditMetas}
            className="erp-focus-ring erp-btn erp-btn-secondary erp-btn--sm"
          >
            Definir metas
          </button>
        ) : null}
      </div>
      <div className="space-y-3">
        <MetaProgressBar
          label="Leads"
          atual={metas.atualLeads}
          meta={metas.metaLeads}
          percent={metas.progressoLeads}
          formatAtual={(v) => String(v)}
          formatMeta={(v) => String(v)}
        />
        <MetaProgressBar
          label="Fechamentos"
          atual={metas.atualFechamentos}
          meta={metas.metaFechamentos}
          percent={metas.progressoFechamentos}
          formatAtual={(v) => String(v)}
          formatMeta={(v) => String(v)}
        />
        <MetaProgressBar
          label="Valor fechado"
          atual={metas.atualValor}
          meta={metas.metaValor}
          percent={metas.progressoValor}
          formatAtual={(v) => formatCrmCurrency(v)}
          formatMeta={(v) => formatCrmCurrency(v)}
        />
      </div>
    </div>
  );
}

export function CrmDashboard(props: {
  data: CrmDashboardDto | null;
  loading: boolean;
  originFilter: CrmCardOrigin | 'TODOS';
  periodFilter: CrmDashboardPeriod;
  isAdmin: boolean;
  onOriginFilterChange: (value: CrmCardOrigin | 'TODOS') => void;
  onPeriodFilterChange: (value: CrmDashboardPeriod) => void;
  onEditMetas: () => void;
}) {
  const {
    data,
    loading,
    originFilter,
    periodFilter,
    isAdmin,
    onOriginFilterChange,
    onPeriodFilterChange,
    onEditMetas,
  } = props;
  const resumo = data?.resumo;
  const porOrigem = data?.porOrigem ?? [];

  return (
    <section className="erp-module-panel min-h-0 flex-1 overflow-y-auto p-3">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--erp-fg-muted)]">
          Métricas do funil comercial
          {originFilter !== 'TODOS' ? ` · ${CRM_ORIGIN_LABEL[originFilter]}` : ''}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={periodFilter}
            onChange={(e) =>
              onPeriodFilterChange(e.target.value as CrmDashboardPeriod)
            }
            className="erp-module-input w-auto min-w-[8rem]"
          >
            {CRM_DASHBOARD_PERIODS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={originFilter}
            onChange={(e) =>
              onOriginFilterChange(e.target.value as CrmCardOrigin | 'TODOS')
            }
            className="erp-module-input w-auto min-w-[10rem]"
          >
            <option value="TODOS">Todos</option>
            {CRM_CARD_ORIGINS.map((origin) => (
              <option key={origin} value={origin}>
                {CRM_ORIGIN_LABEL[origin]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!loading && data?.metasMes ? (
        <MetasDoMesSection
          metas={data.metasMes}
          isAdmin={isAdmin}
          onEditMetas={onEditMetas}
        />
      ) : null}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-24 animate-pulse rounded-xl border border-[var(--erp-border)] bg-[var(--erp-bg-muted)]"
            />
          ))}
        </div>
      ) : resumo ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard label="Leads" value={String(resumo.leads)} />
            <MetricCard label="Orçamentos" value={String(resumo.orcamentos)} />
            <MetricCard label="Fechados" value={String(resumo.fechados)} />
            <MetricCard
              label="Valor fechado"
              value={formatCrmCurrency(resumo.valorFechado)}
            />
            <MetricCard
              label="Ticket médio"
              value={formatCrmCurrency(resumo.ticketMedio)}
            />
            <MetricCard
              label="Taxa lead → fechado"
              value={formatPercent(resumo.taxaLeadFechado)}
              hint={`Lead → orçamento: ${formatPercent(resumo.taxaLeadOrcamento)} · Orçamento → fechado: ${formatPercent(resumo.taxaOrcamentoFechado)}`}
            />
            <MetricCard
              label="Leads sem contato"
              value={String(resumo.leadsSemContato)}
              hint="Mais de 3 dias sem touchpoint (exc. Fechado/Perdido)"
              alert={resumo.leadsSemContato > 0}
            />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <OriginGroupedChart porOrigem={porOrigem} />
            <CrmMotivosPerdaPieChart data={data?.motivosPerdaDistribuicao ?? []} />
          </div>

          <div className="erp-module-card mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--erp-border)] text-left text-xs uppercase tracking-wide text-[var(--erp-fg-muted)]">
                  <th className="px-4 py-3">Origem</th>
                  <th className="px-4 py-3">Leads</th>
                  <th className="px-4 py-3">Orçamentos</th>
                  <th className="px-4 py-3">Fechados</th>
                  <th className="px-4 py-3">Taxa lead → fechado</th>
                  <th className="px-4 py-3">Ticket médio</th>
                  <th className="px-4 py-3">Ciclo médio</th>
                  <th className="px-4 py-3">Touchpoints médios</th>
                </tr>
              </thead>
              <tbody>
                {porOrigem.map((row) => (
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
                    <td className="px-4 py-3 text-[var(--erp-fg)]">{row.orcamentos}</td>
                    <td className="px-4 py-3 text-[var(--erp-fg)]">{row.fechados}</td>
                    <td className="px-4 py-3 text-[var(--erp-fg)]">
                      {formatPercent(row.taxaLeadFechado)}
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

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MetricCard
              label="Ciclo médio de vendas"
              value={formatDays(resumo.cicloMedioDias)}
            />
            <MetricCard
              label="Touchpoints médios"
              value={resumo.touchpointsMedios.toLocaleString('pt-BR', {
                maximumFractionDigits: 1,
              })}
            />
          </div>
        </>
      ) : (
        <div className="flex min-h-[12rem] items-center justify-center text-sm text-[var(--erp-fg-muted)]">
          Não foi possível carregar o dashboard.
        </div>
      )}
    </section>
  );
}
