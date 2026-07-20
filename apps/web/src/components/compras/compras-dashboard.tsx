'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CircleDollarSign,
  Package,
  ShoppingCart,
  Stamp,
} from 'lucide-react';
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { EmptyState } from '@/src/components/ui/empty-state';
import { TableSkeleton } from '@/src/components/ui/skeleton';
import type { PurchaseRequest, PurchaseType } from './compras-types';
import { KANBAN_COLUMNS, purchaseStatusLabel } from './compras-types';
import {
  calcEngravingTotalFromRow,
  calcPaidTotalFromRow,
  calcPurchaseTotalFromRow,
  displayName,
  displayQty,
  formatDate,
  formatMoney,
  formatMoneyNumber,
  kanbanColumnForStatus,
  purchaseUnitPrice,
} from './compras-utils';

type DashboardSource = Extract<PurchaseType, 'VENDA_EXTERNA' | 'WEG_CONTRATO'>;

const SOURCES: Array<{ id: DashboardSource; label: string; hint: string }> = [
  {
    id: 'VENDA_EXTERNA',
    label: 'Venda Externa',
    hint: 'Itens e gravação para pedidos externos',
  },
  {
    id: 'WEG_CONTRATO',
    label: 'WEG',
    hint: 'Requisições de produto por contrato',
  },
];

const STATUS_COLORS: Record<string, string> = {
  SOLICITADO: '#F59E0B',
  PEDIDO_ENVIADO_APROVADO: '#2AACE2',
  PEDIDO_PAGO: '#6366F1',
  LAYOUT_APROVADO: '#8B5CF6',
  EM_PRODUCAO: '#14B8A6',
  EXPEDIDO: '#0EA5E9',
  RECEBIDO: '#22C55E',
  RECUSADO: '#F43F5E',
};

function sumMoney(values: Array<number | null | undefined>): number {
  return values.reduce<number>((acc, value) => {
    const n = value ?? 0;
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}

function moneyOrDash(value: number) {
  if (!Number.isFinite(value) || value <= 0) return formatMoneyNumber(null);
  return formatMoneyNumber(value);
}

function buildSummary(rows: PurchaseRequest[]) {
  const openRows = rows.filter((row) => row.status !== 'RECUSADO');
  return {
    count: rows.length,
    open: openRows.length,
    urgent: rows.filter((row) => row.priority === 'URGENTE').length,
    itemValue: sumMoney(rows.map(calcPurchaseTotalFromRow)),
    engravingValue: sumMoney(rows.map(calcEngravingTotalFromRow)),
    paidValue: sumMoney(rows.map(calcPaidTotalFromRow)),
  };
}

export function ComprasDashboard(props: { rows: PurchaseRequest[]; loading: boolean }) {
  const { rows, loading } = props;
  const [source, setSource] = useState<DashboardSource>('VENDA_EXTERNA');

  const counts = useMemo(
    () => ({
      VENDA_EXTERNA: rows.filter((row) => row.type === 'VENDA_EXTERNA').length,
      WEG_CONTRATO: rows.filter((row) => row.type === 'WEG_CONTRATO').length,
    }),
    [rows],
  );

  const selectedRows = useMemo(
    () => rows.filter((row) => row.type === source),
    [rows, source],
  );

  const summary = useMemo(() => buildSummary(selectedRows), [selectedRows]);

  const statusDistribution = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of selectedRows) {
      const key = kanbanColumnForStatus(row.status) ?? row.status;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return KANBAN_COLUMNS.map((column) => ({
      id: column.id,
      name: column.label,
      value: map.get(column.id) ?? 0,
      color: STATUS_COLORS[column.id] ?? '#94A3B8',
    })).filter((item) => item.value > 0);
  }, [selectedRows]);

  const priorityDistribution = useMemo(() => {
    const urgent = selectedRows.filter((row) => row.priority === 'URGENTE').length;
    const normal = selectedRows.length - urgent;
    return [
      { id: 'URGENTE', name: 'Urgente', value: urgent, color: '#F43F5E' },
      { id: 'NORMAL', name: 'Normal', value: normal, color: '#94A3B8' },
    ].filter((item) => item.value > 0);
  }, [selectedRows]);

  const isWeg = source === 'WEG_CONTRATO';

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-2">
      {/* Origem */}
      <div className="inline-flex w-full max-w-xl rounded-2xl border border-gray-200 bg-gray-50 p-1 sm:w-auto">
        {SOURCES.map((item) => {
          const active = source === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSource(item.id)}
              className={`flex min-w-0 flex-1 flex-col rounded-xl px-4 py-2.5 text-left transition sm:min-w-[11rem] ${
                active
                  ? 'bg-white text-slate-950 shadow-sm ring-1 ring-[#2AACE2]/35'
                  : 'text-[var(--erp-fg-secondary)] hover:bg-white/70'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{item.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    active
                      ? 'bg-[#2AACE2]/15 text-[#1E96CC]'
                      : 'bg-gray-200/80 text-[var(--erp-fg-muted)]'
                  }`}
                >
                  {counts[item.id]}
                </span>
              </span>
              <span className="mt-0.5 truncate text-[11px] text-[var(--erp-fg-muted)]">
                {item.hint}
              </span>
            </button>
          );
        })}
      </div>

      {/* Métricas primordiais */}
      <div className="grid gap-3 md:grid-cols-2">
        <HeroMetric
          tone="item"
          icon={Package}
          label="Valor do Item"
          hint={
            isWeg
              ? 'Soma do preço base × quantidade (WEG)'
              : 'Soma do preço do produto × quantidade'
          }
          value={moneyOrDash(summary.itemValue)}
          loading={loading}
        />
        <HeroMetric
          tone="engraving"
          icon={Stamp}
          label="Valor de Gravação"
          hint="Soma do custo de gravação × quantidade"
          value={moneyOrDash(summary.engravingValue)}
          loading={loading}
        />
      </div>

      {/* KPIs secundários */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={CircleDollarSign}
          label="Valor pago"
          value={moneyOrDash(summary.paidValue)}
          loading={loading}
        />
        <StatCard
          icon={ShoppingCart}
          label="Solicitações"
          value={loading ? '—' : String(summary.count)}
          loading={loading}
        />
        <StatCard
          icon={AlertTriangle}
          label="Urgentes"
          value={loading ? '—' : String(summary.urgent)}
          loading={loading}
          accent="rose"
        />
        <StatCard
          icon={Package}
          label="Em aberto"
          value={loading ? '—' : String(summary.open)}
          loading={loading}
        />
      </div>

      {/* Distribuições */}
      <div className="grid gap-3 lg:grid-cols-2">
        <DistributionCard
          title="Status das solicitações"
          emptyLabel="Sem dados de status no período"
          data={statusDistribution}
          loading={loading}
        />
        <DistributionCard
          title="Prioridade"
          emptyLabel="Sem dados de prioridade no período"
          data={priorityDistribution}
          loading={loading}
        />
      </div>

      {/* Lista */}
      <div className="erp-module-card overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-gray-200 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--erp-fg)]">
              Solicitações — {isWeg ? 'WEG' : 'Venda Externa'}
            </h2>
            <p className="text-xs text-[var(--erp-fg-muted)]">
              Valores consolidados no período selecionado.
            </p>
          </div>
          <p className="text-xs font-medium text-[var(--erp-fg-secondary)]">
            {selectedRows.length} registro{selectedRows.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[52rem]">
            <div className="grid grid-cols-[1.4fr_0.45fr_0.7fr_0.7fr_0.7fr_0.9fr] border-b border-gray-100 bg-gray-50/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--erp-fg-muted)]">
              <span>Item</span>
              <span>Qtd.</span>
              <span>{isWeg ? 'Preço base' : 'Preço item'}</span>
              <span>Gravação</span>
              <span>Valor pago</span>
              <span>Status</span>
            </div>

            {loading ? (
              <div className="px-4 py-4">
                <TableSkeleton rows={6} columns={6} header={false} />
              </div>
            ) : selectedRows.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  compact
                  icon={ShoppingCart}
                  title="Nenhuma requisição encontrada"
                  description="Ajuste o período ou a origem para ver solicitações neste dashboard."
                />
              </div>
            ) : (
              selectedRows.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[1.4fr_0.45fr_0.7fr_0.7fr_0.7fr_0.9fr] items-center border-t border-gray-100 px-4 py-2.5 text-sm text-[var(--erp-fg-secondary)]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--erp-fg)]">
                      {displayName(row)}
                    </p>
                    <p className="truncate text-xs text-[var(--erp-fg-muted)]">
                      {row.sku ?? row.product?.sku ?? 'Sem SKU'}
                      {' · '}
                      {formatDate(row.createdAt)}
                    </p>
                  </div>
                  <span className="font-medium text-[var(--erp-fg)]">
                    {displayQty(row)}
                  </span>
                  <span>
                    {isWeg
                      ? formatMoneyNumber(Number(purchaseUnitPrice(row)))
                      : formatMoney(row.itemPrice)}
                  </span>
                  <span>{formatMoney(row.engravingPrice)}</span>
                  <span className="font-medium text-[var(--erp-fg)]">
                    {formatMoney(row.purchaseValue)}
                  </span>
                  <span className="truncate text-xs font-medium">
                    {purchaseStatusLabel(row.status)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroMetric(props: {
  label: string;
  hint: string;
  value: string;
  loading: boolean;
  icon: typeof Package;
  tone: 'item' | 'engraving';
}) {
  const Icon = props.icon;
  const toneClass =
    props.tone === 'item'
      ? 'from-[#2AACE2]/12 to-[#5BBFB0]/08 ring-[#2AACE2]/25'
      : 'from-[#F59E0B]/12 to-[#F97316]/08 ring-[#F59E0B]/25';
  const iconClass =
    props.tone === 'item'
      ? 'bg-[#2AACE2]/15 text-[#1E96CC]'
      : 'bg-[#F59E0B]/20 text-[#B45309]';

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br p-5 ring-1 ${toneClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-fg-muted)]">
            {props.label}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-[var(--erp-fg)] sm:text-3xl">
            {props.loading ? '—' : props.value}
          </p>
          <p className="mt-1 text-xs text-[var(--erp-fg-muted)]">{props.hint}</p>
        </div>
        <span
          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${iconClass}`}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
    </div>
  );
}

function StatCard(props: {
  label: string;
  value: string;
  loading: boolean;
  icon: typeof Package;
  accent?: 'rose';
}) {
  const Icon = props.icon;
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            props.accent === 'rose'
              ? 'bg-rose-50 text-rose-600'
              : 'bg-gray-100 text-[var(--erp-fg-secondary)]'
          }`}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--erp-fg-muted)]">
            {props.label}
          </p>
          <p className="truncate text-lg font-bold text-[var(--erp-fg)]">
            {props.loading ? '—' : props.value}
          </p>
        </div>
      </div>
    </div>
  );
}

function DistributionCard(props: {
  title: string;
  emptyLabel: string;
  loading: boolean;
  data: Array<{ id: string; name: string; value: number; color: string }>;
}) {
  const total = props.data.reduce((acc, item) => acc + item.value, 0);

  return (
    <div className="erp-module-card p-4">
      <h3 className="text-sm font-semibold text-[var(--erp-fg)]">{props.title}</h3>
      {props.loading ? (
        <div className="mt-4 h-40 animate-pulse rounded-xl bg-gray-100" />
      ) : total === 0 ? (
        <p className="mt-6 text-sm text-[var(--erp-fg-muted)]">{props.emptyLabel}</p>
      ) : (
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="mx-auto h-40 w-40 shrink-0 sm:mx-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={props.data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={42}
                  outerRadius={68}
                  paddingAngle={2}
                  stroke="none"
                >
                  {props.data.map((item) => (
                    <Cell key={item.id} fill={item.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [`${value ?? 0}`, 'Qtd.']}
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #e5e7eb',
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="min-w-0 flex-1 space-y-2">
            {props.data.map((item) => {
              const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
              return (
                <li key={item.id} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: item.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[var(--erp-fg-secondary)]">
                    {item.name}
                  </span>
                  <span className="font-semibold text-[var(--erp-fg)]">
                    {item.value}
                  </span>
                  <span className="w-9 text-right text-[var(--erp-fg-muted)]">
                    {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
