'use client';

import {
  AlertTriangle,
  CircleDollarSign,
  ClipboardList,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FinHealthCard, FinMetricCard } from '@/src/components/financeiro/metric-card';
import { RevenueChart } from '@/src/components/financeiro/revenue-chart';
import {
  FinChartSkeleton,
  FinMetricSkeleton,
} from '@/src/components/financeiro/skeletons';
import type { FinanceiroDashboard, FinanceiroPeriod, ExtratoResponse } from '@/src/components/financeiro/types';
import {
  buildFinanceiroPeriodQuery,
  buildRevenueChartSeries,
  computeHealthScore,
  computeMargemBruta,
  computeTicketMedio,
  countNfsInPeriod,
  fetchAllNfsEmAberto,
  formatCurrency,
  resolveEffectiveChartRange,
} from '@/src/components/financeiro/utils';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

export function FinanceiroDashboardTab(props: {
  period: FinanceiroPeriod;
  refreshToken: number;
}) {
  const { period, refreshToken } = props;
  const [data, setData] = useState<FinanceiroDashboard | null>(null);
  const [chartPoints, setChartPoints] = useState(
    [] as ReturnType<typeof buildRevenueChartSeries>,
  );
  const [nfsCount, setNfsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const periodQuery = buildFinanceiroPeriodQuery(period);
      const [dashboard, extrato, nfs] = await Promise.all([
        erpFetchJson<FinanceiroDashboard>(`api/financeiro/dashboard${periodQuery}`),
        erpFetchJson<ExtratoResponse>(`api/financeiro/extrato${periodQuery}`),
        fetchAllNfsEmAberto(),
      ]);
      setData(dashboard);
      const chartRange = resolveEffectiveChartRange(
        period.dataInicio,
        period.dataFim,
        nfs,
        extrato,
      );
      setChartPoints(buildRevenueChartSeries(chartRange.dataInicio, chartRange.dataFim, nfs, extrato));
      setNfsCount(countNfsInPeriod(nfs, period.dataInicio, period.dataFim));
    } catch (e) {
      setData(null);
      setChartPoints([]);
      setError(e instanceof Error ? e.message : 'Erro ao carregar dashboard.');
    } finally {
      setLoading(false);
    }
  }, [period.dataInicio, period.dataFim]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const margem = useMemo(
    () => (data ? computeMargemBruta(data) : 0),
    [data],
  );

  const health = useMemo(
    () => (data ? computeHealthScore(data) : null),
    [data],
  );

  const ticket = useMemo(
    () => (data ? computeTicketMedio(data, nfsCount) : 0),
    [data, nfsCount],
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <FinMetricSkeleton key={i} />
          ))}
        </div>
        <FinChartSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-[var(--fin-danger)]" role="alert">
        {error}
      </p>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
        <FinMetricCard
          label="Pedidos no Período"
          value={formatCurrency(data.valorPedidosPeriodo)}
          icon={TrendingUp}
          hint="Todos os status, filtrado por data do pedido"
        />
        <FinMetricCard
          label="Faturado no Período"
          value={formatCurrency(data.valorFaturadoPeriodo)}
          icon={CircleDollarSign}
          hint="Status CA = Faturado, filtrado por data do pedido"
        />
        <FinMetricCard
          label="Total Histórico de Pedidos"
          value={formatCurrency(data.valorPedidosHistorico)}
          icon={ClipboardList}
          hint="Todos os pedidos, sem filtro de data"
        />
        <FinMetricCard
          label="Total Histórico Faturado"
          value={formatCurrency(data.valorFaturadoHistorico)}
          icon={Wallet}
          hint="Status CA = Faturado, sem filtro de data"
        />
        <FinMetricCard
          label="Faturamento do período"
          value={formatCurrency(data.valorPedidosPeriodo)}
          icon={Receipt}
          hint="NFs emitidas no intervalo"
        />
        <FinMetricCard
          label="Total recebido"
          value={formatCurrency(data.totalPago)}
          tone="success"
          icon={Wallet}
          hint="Pagamentos confirmados"
        />
        <FinMetricCard
          label="Total em aberto"
          value={formatCurrency(data.totalEmAberto)}
          icon={ClipboardList}
          hint="Aguardando recebimento"
        />
        <FinMetricCard
          label="Total atrasado (>12d)"
          value={formatCurrency(data.totalAtrasado)}
          tone="danger"
          icon={AlertTriangle}
          hint="Requer cobrança"
        />
        <FinMetricCard
          label="Despesas do período"
          value={formatCurrency(data.despesasMes)}
          icon={Receipt}
        />
        <FinMetricCard
          label="Margem bruta estimada"
          value={`${margem.toFixed(1)}%`}
          tone={margem >= 15 ? 'success' : margem >= 5 ? 'warning' : 'danger'}
          extra={
            <div
              className="h-1.5 overflow-hidden rounded-full"
              style={{ background: 'var(--fin-card-muted)' }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, Math.max(0, margem))}%`,
                  background: 'var(--fin-success)',
                }}
              />
            </div>
          }
        />
        {health ? (
          <FinHealthCard grade={health.grade} label={health.label} tone={health.tone} />
        ) : null}
        <FinMetricCard
          label="Ticket médio / NF"
          value={formatCurrency(ticket)}
          icon={CircleDollarSign}
          hint={`Baseado em ${nfsCount} emissões`}
        />
      </div>

      <div className="fin-card rounded-2xl p-4 sm:p-6">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-[var(--fin-text)] sm:text-base">
            Faturamento vs Recebimento
          </h2>
          <p className="text-xs text-[var(--fin-text-muted)]">
            Escala adaptativa por período selecionado
          </p>
        </div>
        <RevenueChart points={chartPoints} />
      </div>
    </div>
  );
}
