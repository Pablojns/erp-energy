'use client';

import {
  CRM_CARD_ORIGINS,
  CRM_ORIGIN_BADGE_CLASS,
  CRM_ORIGIN_LABEL,
  formatCrmCurrency,
  type CrmCardOrigin,
  type CrmDashboardDto,
} from '@/src/services/api/crm-api';

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

function BarChart(props: {
  porOrigem: CrmDashboardDto['porOrigem'];
  metric: 'leads' | 'fechados' | 'taxaLeadFechado';
}) {
  const max = Math.max(
    ...props.porOrigem.map((row) =>
      props.metric === 'taxaLeadFechado' ? row.taxaLeadFechado : row[props.metric],
    ),
    1,
  );

  const labels: Record<typeof props.metric, string> = {
    leads: 'Leads',
    fechados: 'Fechados',
    taxaLeadFechado: 'Taxa lead → fechado',
  };

  return (
    <div className="erp-module-card p-4">
      <h3 className="text-sm font-semibold text-[var(--erp-fg)]">{labels[props.metric]}</h3>
      <div className="mt-4 space-y-3">
        {props.porOrigem.map((row) => {
          const value =
            props.metric === 'taxaLeadFechado' ? row.taxaLeadFechado : row[props.metric];
          const width = `${Math.max(4, (value / max) * 100)}%`;
          const display =
            props.metric === 'taxaLeadFechado' ? formatPercent(value) : String(value);

          return (
            <div key={row.origin}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 font-semibold uppercase ${CRM_ORIGIN_BADGE_CLASS[row.origin]}`}
                >
                  {CRM_ORIGIN_LABEL[row.origin]}
                </span>
                <span className="font-semibold text-[var(--erp-fg)]">{display}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-[color-mix(in_srgb,var(--erp-accent)_70%,white)] transition-all"
                  style={{ width }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CrmDashboard(props: {
  data: CrmDashboardDto | null;
  loading: boolean;
  originFilter: CrmCardOrigin | 'TODOS';
  onOriginFilterChange: (value: CrmCardOrigin | 'TODOS') => void;
}) {
  const { data, loading, originFilter, onOriginFilterChange } = props;
  const resumo = data?.resumo;
  const porOrigem = data?.porOrigem ?? [];

  return (
    <section className="erp-module-panel min-h-0 flex-1 overflow-y-auto p-3">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--erp-fg-muted)]">
          Métricas do funil comercial
          {originFilter !== 'TODOS' ? ` · ${CRM_ORIGIN_LABEL[originFilter]}` : ''}
        </p>
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
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <BarChart porOrigem={porOrigem} metric="leads" />
            <BarChart porOrigem={porOrigem} metric="fechados" />
            <BarChart porOrigem={porOrigem} metric="taxaLeadFechado" />
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
