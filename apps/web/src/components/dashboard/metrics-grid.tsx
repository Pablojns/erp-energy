import {
  BadgeCheck,
  Banknote,
  CircleDollarSign,
  Clock,
  FileWarning,
  PackageCheck,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react';
import { MetricCard } from '@/src/components/dashboard/metric-card';
import type { DashboardResumo } from '@/src/components/dashboard/types';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  slaTone,
} from '@/src/components/dashboard/utils';

type MetricsGridProps = {
  data: DashboardResumo;
};

export function MetricsGrid({ data }: MetricsGridProps) {
  const { f } = {
    f: data.financeiro,
  };

  const sla = slaTone(f.taxaSLA);

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard
        label="Faturamento do Período"
        value={formatCurrency(f.faturamentoMes)}
        icon={Banknote}
      />
      <MetricCard
        label="Faturamento Total Histórico"
        value={formatCurrency(f.faturamentoTotal)}
        icon={TrendingUp}
      />
      <MetricCard
        label="Total de Pedidos"
        value={formatNumber(f.totalPedidosMes)}
        icon={ShoppingCart}
      />
      <MetricCard
        label="Pedidos Concluídos"
        value={formatNumber(f.pedidosConcluidos)}
        icon={PackageCheck}
      />
      <MetricCard
        label="Pedidos Atrasados"
        value={formatNumber(f.pedidosAtrasados)}
        icon={Clock}
        tone={f.pedidosAtrasados > 0 ? 'danger' : 'default'}
      />
      <MetricCard
        label="Ticket Médio"
        value={formatCurrency(f.ticketMedio)}
        icon={CircleDollarSign}
      />
      <MetricCard
        label="Taxa SLA"
        value={formatPercent(f.taxaSLA)}
        icon={BadgeCheck}
        tone={sla}
      />
      <MetricCard
        label="Pedidos sem NF"
        value={formatNumber(data.pedidosSemNF)}
        icon={FileWarning}
        tone={data.pedidosSemNF > 0 ? 'warning' : 'default'}
      />
    </section>
  );
}

export function MetricsGridSkeleton() {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="dash-card p-5 space-y-3">
          <div className="dash-skeleton h-6 w-6 rounded-full" />
          <div className="dash-skeleton h-8 w-2/3" />
          <div className="dash-skeleton h-3 w-1/2" />
        </div>
      ))}
    </section>
  );
}
