'use client';

import { useCallback, useEffect, useState } from 'react';
import { DASH_SCROLL } from '@/src/components/dashboard/scroll-classes';
import { Download } from 'lucide-react';
import {
  DualMonthlyChart,
  DualMonthlyChartSkeleton,
} from '@/src/components/dashboard/dual-monthly-chart';
import { FinanceMetricsGrid, FinanceMetricsGridSkeleton } from '@/src/components/dashboard/metrics-grid';
import { MetricCard, MetricCardSkeleton } from '@/src/components/dashboard/metric-card';
import type { DateRange, FinanceiroDashboardData, MonthlyOrdersPoint, MonthlyTableRow } from '@/src/components/dashboard/types';
import {
  buildMonthlyTable,
  downloadCsv,
  fetchDashboardResumo,
  fetchFinanceiroDashboard,
  fetchMonthlyOrdersChart,
  formatCurrency,
  formatNumber,
  formatPercent,
} from '@/src/components/dashboard/utils';

type TabFinanceiroProps = {
  period: DateRange;
  refreshKey: number;
};

export function TabFinanceiro({ period, refreshKey }: TabFinanceiroProps) {
  const [fin, setFin] = useState<FinanceiroDashboardData | null>(null);
  const [secondary, setSecondary] = useState<{
    ticketMedio: number;
    taxaSLA: number;
    pedidosSemNF: number;
    pedidosAtrasados: number;
  } | null>(null);
  const [chartPoints, setChartPoints] = useState<MonthlyOrdersPoint[]>([]);
  const [table, setTable] = useState<MonthlyTableRow[]>([]);
  const [loadingFin, setLoadingFin] = useState(true);
  const [loadingChart, setLoadingChart] = useState(true);
  const [errorFin, setErrorFin] = useState<string | null>(null);
  const [errorChart, setErrorChart] = useState<string | null>(null);

  const loadFin = useCallback(async () => {
    setLoadingFin(true);
    setErrorFin(null);
    try {
      const [f, r] = await Promise.all([
        fetchFinanceiroDashboard(period),
        fetchDashboardResumo(period),
      ]);
      setFin(f);
      setSecondary({
        ticketMedio: Number(r.financeiro.ticketMedio) || 0,
        taxaSLA: Number(r.financeiro.taxaSLA) || 0,
        pedidosSemNF: Number(r.pedidosSemNF) || 0,
        pedidosAtrasados: Number(r.financeiro.pedidosAtrasados) || 0,
      });
    } catch (e) {
      setFin(null);
      setErrorFin(e instanceof Error ? e.message : 'Erro ao carregar financeiro.');
    } finally {
      setLoadingFin(false);
    }
  }, [period.dataInicio, period.dataFim]);

  const loadChart = useCallback(async () => {
    setLoadingChart(true);
    setErrorChart(null);
    try {
      const points = await fetchMonthlyOrdersChart(period);
      setChartPoints(points);
      setTable(buildMonthlyTable(points));
    } catch (e) {
      setChartPoints([]);
      setTable([]);
      setErrorChart(e instanceof Error ? e.message : 'Erro ao carregar gráfico.');
    } finally {
      setLoadingChart(false);
    }
  }, [period.dataInicio, period.dataFim]);

  useEffect(() => {
    void loadFin();
  }, [loadFin, refreshKey]);

  useEffect(() => {
    void loadChart();
  }, [loadChart, refreshKey]);

  const handleExport = () => {
    if (!fin) return;
    downloadCsv('dashboard-financeiro.csv', ['Métrica', 'Valor'], [
      ['Pedidos no Período', String(fin.valorPedidosPeriodo)],
      ['Faturado no Período', String(fin.valorFaturadoPeriodo)],
      ['Total Histórico Pedidos', String(fin.valorPedidosHistorico)],
      ['Total Histórico Faturado', String(fin.valorFaturadoHistorico)],
    ]);
    if (table.length > 0) {
      downloadCsv(
        'dashboard-financeiro-mensal.csv',
        ['Mês', 'Pedidos', 'Valor Total', 'Valor Faturado', 'Variação %'],
        table.map((r) => [
          r.label,
          String(r.pedidos ?? 0),
          String(r.value),
          String(r.faturado ?? 0),
          String(r.variationPct.toFixed(1)),
        ]),
      );
    }
  };

  return (
    <div className="dash-tab-panel">
      <div className="flex justify-end">
        <button type="button" className="dash-btn-secondary" onClick={handleExport} disabled={!fin}>
          <Download size={16} />
          Exportar Excel
        </button>
      </div>

      {loadingFin ? (
        <FinanceMetricsGridSkeleton />
      ) : errorFin ? (
        <p className="dash-section-error" role="alert">{errorFin}</p>
      ) : fin ? (
        <FinanceMetricsGrid data={fin} />
      ) : null}

      {loadingChart ? (
        <DualMonthlyChartSkeleton />
      ) : errorChart ? (
        <p className="dash-section-error" role="alert">{errorChart}</p>
      ) : chartPoints.length > 0 ? (
        <DualMonthlyChart points={chartPoints} />
      ) : (
        <DualMonthlyChart points={[]} />
      )}

      {table.length > 0 ? (
        <div className="dash-card w-full p-4 md:p-6">
          <h3 className="mb-3 text-sm font-semibold text-[var(--dash-text)]">Pedidos por mês</h3>
          <div className={`${DASH_SCROLL} max-h-[400px]`}>
            <table className="dash-table">
            <thead>
              <tr>
                <th>Mês</th>
                <th>Pedidos</th>
                <th>Valor total</th>
                <th>Valor faturado</th>
                <th>Variação</th>
              </tr>
            </thead>
            <tbody>
              {table.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td>{formatNumber(row.pedidos ?? 0)}</td>
                  <td>{formatCurrency(row.value)}</td>
                  <td>{formatCurrency(row.faturado ?? 0)}</td>
                  <td>{formatPercent(row.variationPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ) : null}

      {loadingFin ? (
        <div className="dash-card-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>
      ) : secondary ? (
        <div className="dash-card-grid">
          <MetricCard label="Ticket Médio" value={formatCurrency(secondary.ticketMedio)} />
          <MetricCard label="Taxa SLA" value={formatPercent(secondary.taxaSLA)} tone={secondary.taxaSLA >= 80 ? 'success' : 'warning'} />
          <MetricCard label="Pedidos sem NF" value={formatNumber(secondary.pedidosSemNF)} tone={secondary.pedidosSemNF > 0 ? 'warning' : 'default'} />
          <MetricCard label="Pedidos Atrasados" value={formatNumber(secondary.pedidosAtrasados)} tone={secondary.pedidosAtrasados > 0 ? 'danger' : 'default'} />
        </div>
      ) : null}
    </div>
  );
}
