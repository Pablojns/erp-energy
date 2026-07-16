'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  ClipboardList,
  FileSpreadsheet,
  Package,
  Plus,
  ShoppingCart,
} from 'lucide-react';
import { DualMonthlyChart } from '@/src/components/dashboard/dual-monthly-chart';
import { OverviewKpiCard, OverviewKpiCardSkeleton } from '@/src/components/dashboard/overview-kpi-card';
import {
  StatusDonutChart,
  StatusDonutChartSkeleton,
} from '@/src/components/dashboard/status-donut-chart';
import type {
  DashboardResumo,
  DateRange,
  FinanceiroDashboardData,
  MonthlyOrdersPoint,
} from '@/src/components/dashboard/types';
import {
  computeVariationPct,
  fetchDashboardResumo,
  fetchFinanceiroDashboard,
  fetchMonthlyOrdersChart,
  fetchStockSummary,
  formatCurrency,
  formatDateBr,
  formatNumber,
  formatPercent,
} from '@/src/components/dashboard/utils';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import {
  normalizePedidoFromApi,
  pedidosListFetchInit,
} from '@/src/services/api/pedidos-normalize';
import '@/src/components/dashboard/overview-executive.css';

type RecentOrderRow = {
  id: string;
  code: string;
  customer: string;
  status: string;
  statusTone: 'danger' | 'success' | 'neutral';
  total: number;
  date: string;
};

type TabOverviewProps = {
  period: DateRange;
  refreshKey: number;
  onNavigateTab?: (tab: 'expedicao' | 'estoque' | 'financeiro') => void;
  onNewOrderClick?: () => void;
  userId?: string;
  editMode?: boolean;
  layoutResetKey?: number;
};

function statusMeta(raw: string): { label: string; tone: RecentOrderRow['statusTone'] } {
  const s = raw.toUpperCase();
  if (s.includes('ATRAS') || s === 'DELAYED') {
    return { label: 'Atrasado', tone: 'danger' };
  }
  if (s.includes('FINAL') || s === 'FINALIZADO' || s === 'COMPLETED') {
    return { label: 'Finalizado', tone: 'success' };
  }
  if (s.includes('PEND') || s === 'NOVO' || s === 'NEW') {
    return { label: 'Pendente', tone: 'neutral' };
  }
  return { label: raw || '—', tone: 'neutral' };
}

export function TabOverview({
  period,
  refreshKey,
  onNavigateTab,
  onNewOrderClick,
}: TabOverviewProps) {
  const [fin, setFin] = useState<FinanceiroDashboardData | null>(null);
  const [resumo, setResumo] = useState<DashboardResumo | null>(null);
  const [stock, setStock] = useState<Awaited<ReturnType<typeof fetchStockSummary>> | null>(null);
  const [chart, setChart] = useState<MonthlyOrdersPoint[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrderRow[]>([]);
  const [prevPedidos, setPrevPedidos] = useState<number | null>(null);
  const [prevStockValue, setPrevStockValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErrors([]);
    const errs: string[] = [];

    const recentPromise = erpFetchJson<{ data: Record<string, unknown>[] }>(
      'api/pedidos?pageSize=6&page=1&sortBy=createdAt&sortOrder=desc',
      pedidosListFetchInit,
    )
      .then((res) =>
        res.data.map((raw) => {
          const p = normalizePedidoFromApi(raw);
          const meta = statusMeta(String(p.status ?? ''));
          return {
            id: p.id,
            code: p.externalOrderNumber ?? p.code,
            customer: p.customerName ?? p.receiverName ?? '—',
            status: meta.label,
            statusTone: meta.tone,
            total: Number(p.totalValue) || 0,
            date: p.createdAt ?? '',
          };
        }),
      )
      .catch(() => [] as RecentOrderRow[]);

    const results = await Promise.allSettled([
      fetchFinanceiroDashboard(period),
      fetchDashboardResumo(period),
      fetchStockSummary(period),
      fetchMonthlyOrdersChart(period),
      recentPromise,
    ]);

    if (results[0].status === 'fulfilled') setFin(results[0].value);
    else errs.push('Financeiro');
    if (results[1].status === 'fulfilled') setResumo(results[1].value);
    else errs.push('Expedição');
    if (results[2].status === 'fulfilled') setStock(results[2].value);
    else errs.push('Estoque');
    if (results[3].status === 'fulfilled') setChart(results[3].value);
    else {
      setChart([]);
      errs.push('Gráfico');
    }
    if (results[4].status === 'fulfilled') setRecentOrders(results[4].value);
    else setRecentOrders([]);

    setErrors(errs);
    setLoading(false);
  }, [period.dataInicio, period.dataFim]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!period.dataInicio.trim() || !period.dataFim.trim()) {
      setPrevPedidos(null);
      setPrevStockValue(null);
      return;
    }
    const [y, m] = period.dataInicio.split('-').map(Number);
    const prevStart = new Date(Date.UTC(y, m - 2, 1));
    const prevEnd = new Date(Date.UTC(y, m - 1, 0));
    const pad = (n: number) => String(n).padStart(2, '0');
    const prevRange = {
      dataInicio: `${prevStart.getUTCFullYear()}-${pad(prevStart.getUTCMonth() + 1)}-${pad(prevStart.getUTCDate())}`,
      dataFim: `${prevEnd.getUTCFullYear()}-${pad(prevEnd.getUTCMonth() + 1)}-${pad(prevEnd.getUTCDate())}`,
    };
    void Promise.allSettled([
      fetchDashboardResumo(prevRange),
      fetchStockSummary(prevRange),
    ]).then(([resumoPrev, stockPrev]) => {
      if (resumoPrev.status === 'fulfilled') {
        setPrevPedidos(Number(resumoPrev.value.financeiro.totalPedidosMes) || 0);
      } else setPrevPedidos(null);
      if (stockPrev.status === 'fulfilled') {
        setPrevStockValue(Number(stockPrev.value.valorEstoque) || 0);
      } else setPrevStockValue(null);
    });
  }, [period.dataInicio, period.dataFim]);

  const f = resumo?.financeiro;
  const fluxo = resumo?.fluxo;
  const totalPedidos = Number(f?.totalPedidosMes) || 0;
  const finalized = Number(f?.pedidosConcluidos) || 0;
  const delayed = Number(f?.pedidosAtrasados) || 0;
  const emSeparacao = Number(fluxo?.EM_SEPARACAO) || 0;
  const stockValue = Number(stock?.valorEstoque) || 0;
  const zeroProducts = (stock?.criticalProducts ?? []).filter((p) => p.stockQty <= 0);

  const pedidosDelta =
    prevPedidos != null ? computeVariationPct(totalPedidos, prevPedidos) : null;
  const stockDelta =
    prevStockValue != null ? computeVariationPct(stockValue, prevStockValue) : null;

  const sparkPedidos = useMemo(
    () => chart.slice(-6).map((p) => Number(p.pedidos) || 0),
    [chart],
  );
  const sparkStock = useMemo(
    () => chart.slice(-6).map((p) => Number(p.faturado) || 0),
    [chart],
  );

  const showExpedicao = true;
  const showEstoque = true;
  const showFinanceiro = true;

  const finalizedPct =
    totalPedidos > 0 ? formatPercent((finalized / totalPedidos) * 100) : '0%';
  const delayedPct =
    totalPedidos > 0 ? formatPercent((delayed / totalPedidos) * 100) : '0%';
  const separacaoPct =
    totalPedidos > 0 ? formatPercent((emSeparacao / totalPedidos) * 100) : '0%';

  if (loading) {
    return (
      <div className="dash-overview-panel">
        <div className="exec-overview">
          <div className="exec-overview-kpis">
            {Array.from({ length: 5 }).map((_, i) => (
              <OverviewKpiCardSkeleton key={i} />
            ))}
          </div>
          <div className="exec-overview-middle">
            <div className="exec-card exec-card--fill dash-skeleton min-h-[180px]" />
            <StatusDonutChartSkeleton />
            <div className="exec-card exec-card--fill dash-skeleton min-h-[180px]" />
          </div>
          <div className="exec-overview-bottom">
            <div className="exec-card exec-card--fill dash-skeleton min-h-[140px]" />
            <div className="exec-card exec-card--fill dash-skeleton min-h-[140px]" />
            <div className="exec-card exec-card--fill dash-skeleton min-h-[140px]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-overview-panel">
      <div className="exec-overview">
      {errors.length > 0 ? (
        <p className="exec-overview-error" role="alert">
          Alguns blocos não carregaram: {errors.join(', ')}.
        </p>
      ) : null}

      {(showExpedicao || showEstoque) && (
        <div className="exec-overview-kpis">
          {showExpedicao ? (
            <>
              <OverviewKpiCard
                label="Total de Pedidos"
                value={formatNumber(totalPedidos)}
                delta={pedidosDelta}
                sparkline={sparkPedidos}
              />
              <OverviewKpiCard
                label="Finalizados"
                value={formatNumber(finalized)}
                hint={`${finalizedPct} do total`}
                tone="success"
                sparkline={sparkPedidos}
              />
              <OverviewKpiCard
                label="Em Separação"
                value={formatNumber(emSeparacao)}
                hint={`${separacaoPct} do total`}
                sparkline={sparkPedidos}
              />
              <OverviewKpiCard
                label="Atrasados"
                value={formatNumber(delayed)}
                hint={`${delayedPct} do total`}
                tone={delayed > 0 ? 'danger' : 'default'}
                sparkline={sparkPedidos}
              />
            </>
          ) : null}
          {showEstoque ? (
            <OverviewKpiCard
              label="Valor em Estoque"
              value={formatCurrency(stockValue)}
              delta={stockDelta}
              sparkline={sparkStock}
            />
          ) : null}
        </div>
      )}

      <div className="exec-overview-middle">
        {showFinanceiro || showExpedicao ? (
          <div className="exec-card exec-card--fill exec-card--chart min-h-0 overflow-hidden p-2 md:p-3">
            <DualMonthlyChart
              points={chart}
              title="Pedidos vs Faturado"
              subtitle="Comparativo mensal"
            />
          </div>
        ) : null}

        {showExpedicao && fluxo ? (
          <StatusDonutChart fluxo={fluxo} />
        ) : showExpedicao ? (
          <StatusDonutChartSkeleton />
        ) : null}

        {showEstoque ? (
          <article className="exec-card exec-card--fill flex min-h-0 flex-col p-3 md:p-4">
            <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
              <h3 className="exec-card-title">
                Produtos com Estoque Zerado
                <span className="exec-badge exec-badge--danger">{zeroProducts.length}</span>
              </h3>
              <button
                type="button"
                className="dash-tab-link"
                onClick={() => onNavigateTab?.('estoque')}
              >
                Ver todos
              </button>
            </div>
            <ul className="exec-scroll-list min-h-0 flex-1">
              {zeroProducts.length === 0 ? (
                <li className="exec-empty">Nenhum produto zerado.</li>
              ) : (
                zeroProducts.slice(0, 8).map((p) => (
                  <li key={p.id} className="exec-list-row">
                    <div className="min-w-0">
                      <p className="exec-list-title">{p.name}</p>
                      <p className="exec-list-sub">{p.sku}</p>
                    </div>
                    <span className="exec-badge exec-badge--danger">Zerado</span>
                  </li>
                ))
              )}
            </ul>
          </article>
        ) : null}
      </div>

      <div className="exec-overview-bottom">
        {showFinanceiro && fin ? (
          <article className="exec-card exec-card--fill p-3 md:p-4">
            <h3 className="exec-card-title mb-3">Resumo Financeiro</h3>
            <div className="exec-finance-grid">
              <div className="exec-finance-cell">
                <p className="exec-kpi-label">Pedidos no Período</p>
                <p className="exec-finance-value">{formatCurrency(fin.valorPedidosPeriodo)}</p>
              </div>
              <div className="exec-finance-cell">
                <p className="exec-kpi-label">Faturado no Período</p>
                <p className="exec-finance-value">{formatCurrency(fin.valorFaturadoPeriodo)}</p>
              </div>
              <div className="exec-finance-cell">
                <p className="exec-kpi-label">Ticket Médio</p>
                <p className="exec-finance-value">
                  {formatCurrency(
                    totalPedidos > 0 ? fin.valorPedidosPeriodo / totalPedidos : 0,
                  )}
                </p>
              </div>
              <div className="exec-finance-cell">
                <p className="exec-kpi-label">Taxa SLA</p>
                <p className="exec-finance-value">
                  {formatPercent(Number(f?.taxaSLA) || 0)}
                </p>
              </div>
            </div>
          </article>
        ) : null}

        {showExpedicao ? (
          <article className="exec-card exec-card--fill flex min-h-0 flex-col p-3 md:p-4">
            <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
              <h3 className="exec-card-title">Pedidos Recentes</h3>
              <Link href="/app/expedicao" className="dash-tab-link">
                Ver todos
              </Link>
            </div>
            <div className="exec-table-wrap min-h-0 flex-1 overflow-auto">
              <table className="exec-table">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Status</th>
                    <th>Valor</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="exec-empty">
                        Nenhum pedido recente.
                      </td>
                    </tr>
                  ) : (
                    recentOrders.map((row) => (
                      <tr key={row.id}>
                        <td className="font-semibold text-[#2AACE2]">{row.code}</td>
                        <td>{row.customer}</td>
                        <td>
                          <span
                            className={`exec-status exec-status--${row.statusTone}`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td>{formatCurrency(row.total)}</td>
                        <td>{formatDateBr(row.date)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>
        ) : null}

        <article className="exec-card exec-card--fill p-3 md:p-4">
          <h3 className="exec-card-title mb-3">Ações Rápidas</h3>
          <ul className="exec-actions-list">
            <li>
              <button type="button" className="exec-action-btn" onClick={onNewOrderClick}>
                <Plus className="h-4 w-4" />
                Novo Pedido
              </button>
            </li>
            <li>
              <Link href="/app/expedicao" className="exec-action-btn">
                <ClipboardList className="h-4 w-4" />
                Expedição
              </Link>
            </li>
            <li>
              <Link href="/app/estoque" className="exec-action-btn">
                <Package className="h-4 w-4" />
                Estoque
              </Link>
            </li>
            <li>
              <button
                type="button"
                className="exec-action-btn"
                onClick={() => onNavigateTab?.('financeiro')}
              >
                <BarChart3 className="h-4 w-4" />
                Financeiro
              </button>
            </li>
            <li>
              <Link href="/app/compras" className="exec-action-btn">
                <ShoppingCart className="h-4 w-4" />
                Compras
              </Link>
            </li>
            <li>
              <Link href="/app/expedicao" className="exec-action-btn">
                <FileSpreadsheet className="h-4 w-4" />
                Importar Planilha
              </Link>
            </li>
          </ul>
        </article>
      </div>
      </div>
    </div>
  );
}
