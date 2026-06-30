'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DASH_SCROLL } from '@/src/components/dashboard/scroll-classes';
import {
  ComparisonBanner,
  ComparisonBannerSkeleton,
} from '@/src/components/dashboard/comparison-banner';
import { FinanceMetricsGrid, FinanceMetricsGridSkeleton } from '@/src/components/dashboard/metrics-grid';
import {
  MonthlyOrdersChart,
  MonthlyOrdersChartSkeleton,
} from '@/src/components/dashboard/monthly-orders-chart';
import { MetricCard, MetricCardSkeleton } from '@/src/components/dashboard/metric-card';
import type {
  DashboardResumo,
  DashboardTabId,
  DateRange,
  FinanceiroDashboardData,
  OverviewAlertItem,
} from '@/src/components/dashboard/types';
import {
  fetchCurrentAndPreviousMonth,
  fetchDashboardResumo,
  fetchFinanceiroDashboard,
  fetchMonthlyOrdersChart,
  fetchStockSummary,
  formatCurrency,
  formatNumber,
} from '@/src/components/dashboard/utils';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  FileWarning,
  Package,
  PackageX,
  ShoppingCart,
  Warehouse,
} from 'lucide-react';

function ProgressBlock({ finalized, total }: { finalized: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((finalized / total) * 100)) : 0;
  return (
    <div className="dash-card w-full p-4 md:p-6">
      <div className="mb-2 flex justify-between text-sm">
        <span className="font-medium">Finalizados no período</span>
        <span className="text-[var(--dash-text-muted)]">
          {formatNumber(finalized)} / {formatNumber(total)} ({pct}%)
        </span>
      </div>
      <div className="dash-progress-track">
        <div className="dash-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

type TabOverviewProps = {
  period: DateRange;
  refreshKey: number;
  onNavigateTab: (tab: DashboardTabId) => void;
};

export function TabOverview({ period, refreshKey, onNavigateTab }: TabOverviewProps) {
  const [fin, setFin] = useState<FinanceiroDashboardData | null>(null);
  const [resumo, setResumo] = useState<DashboardResumo | null>(null);
  const [stock, setStock] = useState<Awaited<ReturnType<typeof fetchStockSummary>> | null>(null);
  const [comparison, setComparison] = useState<{ current: number; previous: number } | null>(null);
  const [chart, setChart] = useState<Awaited<ReturnType<typeof fetchMonthlyOrdersChart>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErrors([]);
    const errs: string[] = [];
    const results = await Promise.allSettled([
      fetchFinanceiroDashboard(period),
      fetchDashboardResumo(period),
      fetchStockSummary(period),
      fetchCurrentAndPreviousMonth(),
      fetchMonthlyOrdersChart(),
    ]);
    if (results[0].status === 'fulfilled') setFin(results[0].value);
    else errs.push('Financeiro');
    if (results[1].status === 'fulfilled') setResumo(results[1].value);
    else errs.push('Expedição');
    if (results[2].status === 'fulfilled') setStock(results[2].value);
    else errs.push('Estoque');
    if (results[3].status === 'fulfilled') setComparison(results[3].value);
    if (results[4].status === 'fulfilled') setChart(results[4].value);
    setErrors(errs);
    setLoading(false);
  }, [period.dataInicio, period.dataFim]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const alerts = useMemo((): OverviewAlertItem[] => {
    const items: OverviewAlertItem[] = [];
    const atrasados = Number(resumo?.financeiro.pedidosAtrasados) || 0;
    if (atrasados > 0) {
      items.push({
        id: 'atrasados',
        tone: 'danger',
        title: `${formatNumber(atrasados)} pedidos atrasados`,
        tab: 'expedicao',
      });
    }
    const crit = stock?.criticalProducts?.length ?? 0;
    if (crit > 0) {
      items.push({
        id: 'estoque',
        tone: 'warning',
        title: `${formatNumber(crit)} produtos críticos`,
        tab: 'estoque',
      });
    }
    const semNf = Number(resumo?.pedidosSemNF) || 0;
    if (semNf > 0) {
      items.push({
        id: 'sem-nf',
        tone: 'warning',
        title: `${formatNumber(semNf)} pedidos sem NF`,
        tab: 'alertas',
      });
    }
    return items.slice(0, 3);
  }, [resumo, stock]);

  if (loading) {
    return (
      <div className="dash-tab-panel">
        <ComparisonBannerSkeleton />
        <MonthlyOrdersChartSkeleton />
        <FinanceMetricsGridSkeleton />
        <div className="dash-card-grid">
          {Array.from({ length: 5 }).map((_, i) => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  const f = resumo?.financeiro;
  const fluxo = resumo?.fluxo;
  const zeroCount = stock?.criticalProducts?.filter((p) => p.stockQty <= 0).length ?? 0;

  return (
    <div className="dash-tab-panel">
      {errors.length > 0 ? (
        <p className="dash-section-error" role="alert">
          Alguns blocos não carregaram: {errors.join(', ')}.
        </p>
      ) : null}

      {comparison ? (
        <ComparisonBanner currentMonth={comparison.current} previousMonth={comparison.previous} />
      ) : (
        <ComparisonBannerSkeleton />
      )}

      {chart ? <MonthlyOrdersChart points={chart} /> : <MonthlyOrdersChartSkeleton />}

      <div className="dash-overview-block">
        <div className="flex items-center justify-between">
          <h2 className="dash-block-title">Financeiro</h2>
          <button type="button" className="dash-tab-link" onClick={() => onNavigateTab('financeiro')}>
            Ver aba Financeiro →
          </button>
        </div>
        {fin ? (
          <div className={`${DASH_SCROLL} max-h-[30vh]`}>
            <FinanceMetricsGrid data={fin} />
          </div>
        ) : (
          <FinanceMetricsGridSkeleton />
        )}
      </div>

      <div className="dash-overview-block">
        <div className="flex items-center justify-between">
          <h2 className="dash-block-title">Expedição</h2>
          <button type="button" className="dash-tab-link" onClick={() => onNavigateTab('expedicao')}>
            Ver aba Expedição →
          </button>
        </div>
        {f && fluxo ? (
          <div className={`${DASH_SCROLL} max-h-[30vh] space-y-3`}>
            <div className="dash-card-grid">
              <MetricCard label="Total" value={formatNumber(f.totalPedidosMes)} icon={ShoppingCart} />
              <MetricCard label="Finalizados" value={formatNumber(f.pedidosConcluidos)} icon={CheckCircle2} tone="success" />
              <MetricCard label="Atrasados" value={formatNumber(f.pedidosAtrasados)} icon={AlertTriangle} tone={f.pedidosAtrasados > 0 ? 'danger' : 'default'} />
              <MetricCard label="Em Separação" value={formatNumber(fluxo.EM_SEPARACAO)} icon={Package} />
              <MetricCard label="Aguardando NF" value={formatNumber(fluxo.AGUARDANDO_NF)} icon={FileWarning} tone={fluxo.AGUARDANDO_NF > 0 ? 'warning' : 'default'} />
            </div>
            <ProgressBlock finalized={f.pedidosConcluidos} total={f.totalPedidosMes} />
          </div>
        ) : null}
      </div>

      <div className="dash-overview-block">
        <div className="flex items-center justify-between">
          <h2 className="dash-block-title">Estoque</h2>
          <button type="button" className="dash-tab-link" onClick={() => onNavigateTab('estoque')}>
            Ver aba Estoque →
          </button>
        </div>
        {stock ? (
          <div className={`${DASH_SCROLL} max-h-[30vh]`}>
            <div className="dash-card-grid">
              <MetricCard label="Produtos ativos" value={formatNumber(stock.activeProducts)} icon={Boxes} />
              <MetricCard label="Estoque zerado" value={formatNumber(zeroCount)} icon={PackageX} tone={zeroCount > 0 ? 'danger' : 'default'} />
              <MetricCard label="Valor em estoque" value={formatCurrency(stock.valorEstoque)} icon={Warehouse} />
            </div>
          </div>
        ) : null}
      </div>

      <div className="dash-overview-block">
        <div className="flex items-center justify-between">
          <h2 className="dash-block-title">Alertas</h2>
          <button type="button" className="dash-tab-link" onClick={() => onNavigateTab('alertas')}>
            Ver aba Alertas →
          </button>
        </div>
        <div className="dash-card w-full p-4 md:p-6">
          {alerts.length === 0 ? (
            <p className="text-sm text-[var(--dash-text-muted)]">Nenhum alerta crítico.</p>
          ) : (
            <ul className={`space-y-2 ${DASH_SCROLL} max-h-[30vh]`}>
              {alerts.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className={`dash-alert-item dash-alert-item--${a.tone} w-full text-left`}
                    onClick={() => onNavigateTab(a.tab)}
                  >
                    <AlertTriangle size={18} className="shrink-0" />
                    <span className="text-sm font-semibold">{a.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
