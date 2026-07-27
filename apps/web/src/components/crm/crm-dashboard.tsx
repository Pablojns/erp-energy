'use client';

import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Clock3,
  FileText,
  Loader2,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import {
  CRM_DASHBOARD_PERIODS,
  crmMetaProgressColor,
  type CrmDashboardPeriod,
} from '@/src/components/crm/crm-helpers';
import { CrmMotivosPerdaPieChart } from '@/src/components/crm/crm-motivos-perda-pie';
import {
  CRM_CARD_ORIGINS,
  CRM_ORIGIN_LABEL,
  formatCrmCurrency,
  type CrmCardOrigin,
  type CrmDashboardDto,
  type CrmMetasMesDto,
} from '@/src/services/api/crm-api';

function formatPercent(value: number) {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function formatDuration(dias: number, horas: number) {
  if (!Number.isFinite(dias) || dias <= 0) return '—';
  if (dias >= 1) {
    return `${dias.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
  }
  const h = Math.floor(horas);
  const m = Math.round((horas - h) * 60);
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

function KpiCard(props: {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
  accent: string;
}) {
  return (
    <div className="erp-module-card flex min-h-[7.5rem] flex-col justify-between p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-[var(--erp-fg-muted)]">{props.label}</p>
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: `${props.accent}18`, color: props.accent }}
        >
          {props.icon}
        </span>
      </div>
      <div>
        <p className="mt-3 text-xl font-semibold tracking-tight text-[var(--erp-fg)] sm:text-2xl">
          {props.value}
        </p>
        {props.hint ? (
          <p className="mt-1 text-[11px] text-[var(--erp-fg-muted)]">{props.hint}</p>
        ) : null}
      </div>
    </div>
  );
}

function AttentionCard(props: {
  title: string;
  count: number | string;
  description: string;
  tone?: 'rose' | 'amber' | 'teal' | 'sky';
}) {
  const tone =
    props.tone === 'rose'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : props.tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : props.tone === 'sky'
          ? 'border-sky-200 bg-sky-50 text-sky-800'
          : 'border-teal-200 bg-teal-50 text-teal-800';
  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-snug">{props.title}</p>
        <span className="text-2xl font-bold tabular-nums">{props.count}</span>
      </div>
      <p className="mt-2 text-xs opacity-80">{props.description}</p>
    </div>
  );
}

function MetasDoMesSection(props: {
  metas: CrmMetasMesDto;
  isAdmin: boolean;
  onEditMetas: () => void;
}) {
  const { metas, isAdmin, onEditMetas } = props;
  const MetaBar = (p: {
    label: string;
    atual: number;
    meta: number;
    percent: number;
    formatAtual: (v: number) => string;
    formatMeta: (v: number) => string;
  }) => (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-[var(--erp-fg-muted)]">{p.label}</span>
        <span className="font-medium text-[var(--erp-fg)]">
          {p.formatAtual(p.atual)} / {p.formatMeta(p.meta)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--erp-bg-muted)]">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.min(100, Math.max(0, p.percent))}%`,
            background: crmMetaProgressColor(p.percent),
          }}
        />
      </div>
    </div>
  );

  return (
    <div className="erp-module-card mb-4 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--erp-fg)]">Metas do mês</h3>
        {isAdmin ? (
          <button
            type="button"
            onClick={onEditMetas}
            className="text-xs font-semibold text-[var(--erp-accent)] hover:underline"
          >
            Editar metas
          </button>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <MetaBar
          label="Leads"
          atual={metas.atualLeads}
          meta={metas.metaLeads}
          percent={metas.progressoLeads}
          formatAtual={(v) => String(v)}
          formatMeta={(v) => String(v)}
        />
        <MetaBar
          label="Fechamentos"
          atual={metas.atualFechamentos}
          meta={metas.metaFechamentos}
          percent={metas.progressoFechamentos}
          formatAtual={(v) => String(v)}
          formatMeta={(v) => String(v)}
        />
        <MetaBar
          label="Valor"
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
  customStartDate: string;
  customEndDate: string;
  isAdmin: boolean;
  onOriginFilterChange: (value: CrmCardOrigin | 'TODOS') => void;
  onPeriodFilterChange: (value: CrmDashboardPeriod) => void;
  onCustomRangeChange: (start: string, end: string) => void;
  onRefresh: () => void;
  onEditMetas: () => void;
}) {
  const {
    data,
    loading,
    originFilter,
    periodFilter,
    customStartDate,
    customEndDate,
    isAdmin,
    onOriginFilterChange,
    onPeriodFilterChange,
    onCustomRangeChange,
    onRefresh,
    onEditMetas,
  } = props;

  const completo = data?.completo;
  const resumo = data?.resumo;
  const periodLabel = data?.periodLabel ?? 'período selecionado';

  const vendedorChart = (completo?.porVendedor ?? []).slice(0, 8).map((row) => ({
    nome: row.nome.split(' ')[0] ?? row.nome,
    leads: row.leads,
    fechados: row.fechados,
    taxa: Number(row.taxaConversao.toFixed(1)),
  }));

  return (
    <section className="erp-module-panel min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--erp-fg)]">Dashboard</h2>
          <p className="mt-0.5 text-sm text-[var(--erp-fg-muted)]">
            Saúde comercial de {periodLabel}
            {originFilter !== 'TODOS' ? ` · ${CRM_ORIGIN_LABEL[originFilter]}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--erp-accent)] px-3 py-2 text-xs font-semibold text-white"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Atualizar
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {CRM_DASHBOARD_PERIODS.map((option) => {
          const active = periodFilter === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onPeriodFilterChange(option.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? 'bg-[var(--erp-accent)] text-white'
                  : 'border border-[var(--erp-border)] bg-[var(--erp-bg-elevated)] text-[var(--erp-fg-muted)] hover:text-[var(--erp-fg)]'
              }`}
            >
              {option.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onPeriodFilterChange('custom')}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            periodFilter === 'custom'
              ? 'bg-[var(--erp-accent)] text-white'
              : 'border border-[var(--erp-border)] bg-[var(--erp-bg-elevated)] text-[var(--erp-fg-muted)]'
          }`}
        >
          Personalizado
        </button>
        <select
          value={originFilter}
          onChange={(e) =>
            onOriginFilterChange(e.target.value as CrmCardOrigin | 'TODOS')
          }
          className="erp-module-input ml-auto w-auto min-w-[10rem]"
        >
          <option value="TODOS">Todos os canais</option>
          {CRM_CARD_ORIGINS.map((origin) => (
            <option key={origin} value={origin}>
              {CRM_ORIGIN_LABEL[origin]}
            </option>
          ))}
        </select>
      </div>

      {periodFilter === 'custom' ? (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-bg-elevated)] p-3">
          <label className="text-xs text-[var(--erp-fg-muted)]">
            Data inicial
            <input
              type="date"
              value={customStartDate}
              onChange={(e) =>
                onCustomRangeChange(e.target.value, customEndDate || e.target.value)
              }
              className="erp-module-input mt-1"
            />
          </label>
          <label className="text-xs text-[var(--erp-fg-muted)]">
            Data final
            <input
              type="date"
              value={customEndDate}
              onChange={(e) =>
                onCustomRangeChange(customStartDate || e.target.value, e.target.value)
              }
              className="erp-module-input mt-1"
            />
          </label>
        </div>
      ) : null}

      {!loading && data?.metasMes ? (
        <MetasDoMesSection
          metas={data.metasMes}
          isAdmin={isAdmin}
          onEditMetas={onEditMetas}
        />
      ) : null}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div
              key={idx}
              className="h-28 animate-pulse rounded-xl border border-[var(--erp-border)] bg-[var(--erp-bg-muted)]"
            />
          ))}
        </div>
      ) : completo && resumo ? (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            <KpiCard
              label="Orçamentos"
              value={formatCrmCurrency(completo.valorOrcamentos)}
              hint={`${completo.qtdOrcamentos} registro(s)`}
              accent="#7c3aed"
              icon={<FileText className="h-4 w-4" />}
            />
            <KpiCard
              label="Propostas"
              value={String(completo.qtdPropostas)}
              hint="Enviadas / geradas no período"
              accent="#db2777"
              icon={<Wallet className="h-4 w-4" />}
            />
            <KpiCard
              label="Conversão"
              value={formatPercent(completo.taxaConversao)}
              hint="Orçamento → fechado"
              accent="#0d9488"
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <KpiCard
              label="Ticket médio"
              value={formatCrmCurrency(completo.ticketMedio)}
              hint={`${resumo.fechados} fechamento(s)`}
              accent="#2563eb"
              icon={<ShoppingCart className="h-4 w-4" />}
            />
            <KpiCard
              label="Tempo médio"
              value={formatDuration(
                completo.tempoMedioDias,
                completo.tempoMedioHoras,
              )}
              hint="Criação → fechamento"
              accent="#9333ea"
              icon={<Clock3 className="h-4 w-4" />}
            />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="erp-module-card p-4">
              <h3 className="text-sm font-semibold text-[var(--erp-fg)]">Funil comercial</h3>
              <p className="mt-1 text-xs text-[var(--erp-fg-muted)]">
                Progressão de oportunidades no período
              </p>
              <ol className="mt-5 space-y-5">
                {completo.funil.map((step, index) => (
                  <li key={step.id} className="relative pl-10">
                    <span className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full border border-teal-300 bg-teal-50 text-xs font-bold text-teal-700">
                      {index + 1}
                    </span>
                    {index < completo.funil.length - 1 ? (
                      <span className="absolute left-[13px] top-7 h-[calc(100%+0.75rem)] w-px bg-teal-200" />
                    ) : null}
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-[var(--erp-fg)]">
                          {step.label}
                        </p>
                        <p className="text-xs text-[var(--erp-fg-muted)]">
                          {step.hint}
                          {step.valor != null
                            ? ` · ${formatCrmCurrency(step.valor)}`
                            : ''}
                        </p>
                      </div>
                      <span className="text-sm font-bold tabular-nums text-teal-700">
                        {formatPercent(step.percent)}
                      </span>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--erp-bg-muted)]">
                      <div
                        className="h-full rounded-full bg-teal-500"
                        style={{
                          width: `${Math.min(100, Math.max(0, step.percent))}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="erp-module-card p-4">
              <h3 className="text-sm font-semibold text-[var(--erp-fg)]">Atenção agora</h3>
              <p className="mt-1 text-xs text-[var(--erp-fg-muted)]">
                Filas e sinais que pedem ação
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <AttentionCard
                  title="Orçamentos há mais de 48h sem proposta"
                  count={completo.atencao.orcamentosSemProposta48h}
                  description="Fila que merece resposta antes de novos contatos esfriarem."
                  tone="rose"
                />
                <AttentionCard
                  title="Orçamentos sem proposta"
                  count={completo.atencao.orcamentosSemProposta}
                  description="Solicitações no período ainda sem proposta gerada."
                  tone="amber"
                />
                <AttentionCard
                  title="Propostas geradas hoje"
                  count={completo.atencao.propostasGeradasHoje}
                  description="Propostas CRM + orçamentos no dia atual."
                  tone="teal"
                />
                <AttentionCard
                  title="Fechamentos hoje"
                  count={completo.atencao.fechadosHoje}
                  description="Cards fechados registrados hoje."
                  tone="sky"
                />
                <AttentionCard
                  title="Maior fila sem proposta"
                  count={completo.atencao.maiorFilaSemProposta?.count ?? 0}
                  description={
                    completo.atencao.maiorFilaSemProposta
                      ? completo.atencao.maiorFilaSemProposta.nome
                      : 'Nenhuma fila acumulada.'
                  }
                  tone="amber"
                />
                <AttentionCard
                  title="Em andamento"
                  count={completo.emAndamento.count}
                  description={`${formatCrmCurrency(completo.emAndamento.valor)} em negociação aberta.`}
                  tone="teal"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="erp-module-card p-4">
              <div className="mb-1 flex items-center gap-2">
                <Users className="h-4 w-4 text-[var(--erp-accent)]" />
                <h3 className="text-sm font-semibold text-[var(--erp-fg)]">
                  Desempenho por vendedor
                </h3>
              </div>
              <p className="text-xs text-[var(--erp-fg-muted)]">
                Leads, fechados e taxa de conversão individual
              </p>
              {vendedorChart.length === 0 ? (
                <p className="mt-8 text-center text-sm text-[var(--erp-fg-muted)]">
                  Sem dados de vendedores no período.
                </p>
              ) : (
                <div className="mt-4 h-72 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={vendedorChart}
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(0,0,0,0.06)"
                      />
                      <XAxis
                        dataKey="nome"
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
                      <Bar dataKey="leads" name="Leads" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                      <Bar
                        dataKey="fechados"
                        name="Fechados"
                        fill="#14b8a6"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {completo.porVendedor.length > 0 ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--erp-border)] text-left text-[10px] uppercase tracking-wide text-[var(--erp-fg-muted)]">
                        <th className="py-2 pr-3">Vendedor</th>
                        <th className="py-2 pr-3">Leads</th>
                        <th className="py-2 pr-3">Fechados</th>
                        <th className="py-2 pr-3">Valor</th>
                        <th className="py-2">Conv.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completo.porVendedor.slice(0, 10).map((row) => (
                        <tr
                          key={row.responsavelId ?? row.nome}
                          className="border-b border-[var(--erp-border)] last:border-0"
                        >
                          <td className="py-2 pr-3 font-medium text-[var(--erp-fg)]">
                            {row.nome}
                          </td>
                          <td className="py-2 pr-3">{row.leads}</td>
                          <td className="py-2 pr-3">{row.fechados}</td>
                          <td className="py-2 pr-3">
                            {formatCrmCurrency(row.valorFechado)}
                          </td>
                          <td className="py-2">{formatPercent(row.taxaConversao)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <div className="erp-module-card p-4">
                <h3 className="text-sm font-semibold text-[var(--erp-fg)]">
                  Oportunidades em andamento
                </h3>
                <p className="mt-3 text-3xl font-semibold text-[var(--erp-fg)]">
                  {completo.emAndamento.count}
                </p>
                <p className="mt-1 text-sm text-[var(--erp-fg-muted)]">
                  {formatCrmCurrency(completo.emAndamento.valor)} em negociação
                  (não fechadas / não perdidas)
                </p>
              </div>
              <CrmMotivosPerdaPieChart
                data={data?.motivosPerdaDistribuicao ?? []}
              />
            </div>
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
