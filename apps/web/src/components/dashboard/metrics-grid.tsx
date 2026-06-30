import {
  CircleDollarSign,
  ClipboardList,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { MetricCard } from '@/src/components/dashboard/metric-card';
import type { FinanceiroDashboardData } from '@/src/components/dashboard/types';
import { formatCurrency } from '@/src/components/dashboard/utils';

type FinanceMetricsGridProps = {
  data: FinanceiroDashboardData;
};

export function FinanceMetricsGrid({ data }: FinanceMetricsGridProps) {
  return (
    <div className="dash-grid-metrics">
      <MetricCard
        label="Pedidos no Período"
        value={formatCurrency(data.valorPedidosPeriodo)}
        icon={TrendingUp}
      />
      <MetricCard
        label="Faturado no Período"
        value={formatCurrency(data.valorFaturadoPeriodo)}
        icon={CircleDollarSign}
      />
      <MetricCard
        label="Total Histórico de Pedidos"
        value={formatCurrency(data.valorPedidosHistorico)}
        icon={ClipboardList}
      />
      <MetricCard
        label="Total Histórico Faturado"
        value={formatCurrency(data.valorFaturadoHistorico)}
        icon={Wallet}
      />
    </div>
  );
}

export function FinanceMetricsGridSkeleton() {
  return (
    <div className="dash-grid-metrics">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="dash-card w-full space-y-3 p-4 md:p-6">
          <div className="dash-skeleton h-5 w-5 rounded-full" />
          <div className="dash-skeleton h-8 w-2/3" />
          <div className="dash-skeleton h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** @deprecated Use FinanceMetricsGrid */
export const MetricsGrid = FinanceMetricsGrid;
export const MetricsGridSkeleton = FinanceMetricsGridSkeleton;
