'use client';

import { useCallback, useEffect, useState, type DragEvent, type ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import {
  OverviewFinanceChart,
  OverviewFinanceChartSkeleton,
} from '@/src/components/dashboard/overview-finance-chart';
import {
  DEFAULT_OVERVIEW_CARD_ORDER,
  isDefaultOverviewOrder,
  loadOverviewCardOrder,
  resetOverviewCardOrder,
  saveOverviewCardOrder,
  type OverviewCardId,
} from '@/src/components/dashboard/overview-card-layout';
import type {
  DashboardResumo,
  DateRange,
  DelayedOrderRow,
  FinanceiroDashboardData,
  MonthlyOrdersPoint,
} from '@/src/components/dashboard/types';
import {
  computeVariationPct,
  fetchDashboardResumo,
  fetchFinanceiroDashboard,
  fetchMonthlyOrdersChart,
  fetchPeriodComparison,
  fetchStockSummary,
  formatCurrency,
  formatNumber,
  formatPercent,
} from '@/src/components/dashboard/utils';
import { getOverdueDays } from '@/src/components/expedicao/shared/order-helpers';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { normalizePedidoFromApi, pedidosListFetchInit } from '@/src/services/api/pedidos-normalize';
import '@/src/components/dashboard/overview-executive.css';
import { MobileCollapsibleSection } from '@/src/components/mobile/mobile-collapsible-section';

type TabOverviewProps = {
  period: DateRange;
  refreshKey: number;
  onNavigateTab?: (tab: 'expedicao' | 'estoque' | 'financeiro') => void;
  userId: string;
  editMode?: boolean;
  layoutResetKey?: number;
};

function OverviewDraggableCard(props: {
  cardId: OverviewCardId;
  editMode: boolean;
  onReorder: (from: OverviewCardId, to: OverviewCardId) => void;
  children: ReactNode;
  className?: string;
}) {
  const { cardId, editMode, onReorder, children, className = '' } = props;
  const [dragOver, setDragOver] = useState(false);

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cardId);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const from = e.dataTransfer.getData('text/plain') as OverviewCardId;
    if (from) onReorder(from, cardId);
    setDragOver(false);
  };

  return (
    <div
      className={`dash-overview-card-wrap ${editMode ? 'dash-overview-card-wrap--edit' : ''} ${dragOver ? 'dash-overview-card-wrap--over' : ''} ${className}`}
      draggable={editMode}
      onDragStart={editMode ? handleDragStart : undefined}
      onDragEnd={() => setDragOver(false)}
      onDragOver={
        editMode
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDragOver(true);
            }
          : undefined
      }
      onDragLeave={editMode ? () => setDragOver(false) : undefined}
      onDrop={editMode ? handleDrop : undefined}
    >
      {editMode ? (
        <div className="overview-drag-handle" aria-hidden>
          <GripVertical className="h-4 w-4" />
          <span>Arrastar</span>
        </div>
      ) : null}
      {children}
    </div>
  );
}

function OverviewBlockSkeleton({ tall }: { tall?: boolean }) {
  return (
    <div className={`overview-block ${tall ? 'min-h-[280px]' : ''}`}>
      <div className="overview-skeleton mb-3 h-8 w-24" />
      <div className="overview-stat-grid mb-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="overview-skeleton h-12" />
        ))}
      </div>
      <div className="overview-skeleton mb-3 h-1.5 w-full" />
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="overview-skeleton h-8" />
        ))}
      </div>
    </div>
  );
}

export function TabOverview({
  period,
  refreshKey,
  userId,
  editMode = false,
  layoutResetKey = 0,
}: TabOverviewProps) {
  const [cardOrder, setCardOrder] = useState<OverviewCardId[]>(
    () => DEFAULT_OVERVIEW_CARD_ORDER,
  );
  const [cardOrderHydrated, setCardOrderHydrated] = useState(false);

  useEffect(() => {
    setCardOrder(loadOverviewCardOrder(userId));
    setCardOrderHydrated(true);
  }, [userId]);

  useEffect(() => {
    if (!cardOrderHydrated) return;
    saveOverviewCardOrder(userId, cardOrder);
  }, [cardOrder, cardOrderHydrated, userId]);

  useEffect(() => {
    if (layoutResetKey === 0) return;
    resetOverviewCardOrder(userId);
    setCardOrder([...DEFAULT_OVERVIEW_CARD_ORDER]);
  }, [layoutResetKey, userId]);

  const reorderCards = useCallback((from: OverviewCardId, to: OverviewCardId) => {
    if (from === to) return;
    setCardOrder((prev) => {
      const next = [...prev];
      const fromIndex = next.indexOf(from);
      const toIndex = next.indexOf(to);
      if (fromIndex < 0 || toIndex < 0) return prev;
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, from);
      return next;
    });
  }, []);
  const [fin, setFin] = useState<FinanceiroDashboardData | null>(null);
  const [resumo, setResumo] = useState<DashboardResumo | null>(null);
  const [stock, setStock] = useState<Awaited<ReturnType<typeof fetchStockSummary>> | null>(null);
  const [delayed, setDelayed] = useState<DelayedOrderRow[]>([]);
  const [comparePrevious, setComparePrevious] = useState(false);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparison, setComparison] = useState<{
    current: number;
    previous: number;
    currentLabel: string;
    previousLabel: string;
  } | null>(null);
  const [chart, setChart] = useState<MonthlyOrdersPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  const periodHasRange = Boolean(period.dataInicio.trim() && period.dataFim.trim());

  const load = useCallback(async () => {
    setLoading(true);
    setErrors([]);
    const errs: string[] = [];

    const delayedPromise = erpFetchJson<{ data: Record<string, unknown>[] }>(
      'api/pedidos?status=delayed&pageSize=5&page=1&sortBy=requestedDeliveryDate&sortOrder=asc',
      pedidosListFetchInit,
    )
      .then((res) =>
        res.data
          .map((raw) => {
            const p = normalizePedidoFromApi(raw);
            return {
              id: p.id,
              pedido: p.externalOrderNumber ?? p.code,
              recebedor: p.receiverName ?? p.customerName ?? '—',
              diasAtraso: getOverdueDays(p) ?? 0,
            };
          })
          .sort((a, b) => b.diasAtraso - a.diasAtraso)
          .slice(0, 3),
      )
      .catch(() => [] as DelayedOrderRow[]);

    const results = await Promise.allSettled([
      fetchFinanceiroDashboard(period),
      fetchDashboardResumo(period),
      fetchStockSummary(period),
      fetchMonthlyOrdersChart(period),
      delayedPromise,
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
    if (results[4].status === 'fulfilled') setDelayed(results[4].value);
    else setDelayed([]);

    setErrors(errs);
    setLoading(false);
  }, [period.dataInicio, period.dataFim]);

  const loadComparison = useCallback(async () => {
    if (!periodHasRange) {
      setComparison(null);
      return;
    }
    setComparisonLoading(true);
    try {
      setComparison(await fetchPeriodComparison(period));
    } catch {
      setComparison(null);
    } finally {
      setComparisonLoading(false);
    }
  }, [period.dataInicio, period.dataFim, periodHasRange]);

  useEffect(() => {
    void load();
    setComparePrevious(false);
    setComparison(null);
  }, [load, refreshKey]);

  useEffect(() => {
    if (comparePrevious && periodHasRange) {
      void loadComparison();
      return;
    }
    setComparison(null);
    setComparisonLoading(false);
  }, [comparePrevious, loadComparison, periodHasRange]);

  if (loading) {
    return (
      <div className="dash-overview-panel">
        <div className="dash-overview-grid">
          <div className="dash-overview-row-top">
            <OverviewBlockSkeleton />
            <OverviewBlockSkeleton />
          </div>
          <div className="overview-block">
            <div className="overview-finance-layout">
              <div className="overview-finance-metrics">
                <div className="overview-finance-metrics-row">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="overview-skeleton h-14" />
                  ))}
                </div>
              </div>
              <div className="overview-finance-chart">
                <OverviewFinanceChartSkeleton />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const f = resumo?.financeiro;
  const fluxo = resumo?.fluxo;
  const atrasados = Number(f?.pedidosAtrasados) || 0;
  const zeroCount = stock?.criticalProducts?.filter((p) => p.stockQty <= 0).length ?? 0;
  const finalized = Number(f?.pedidosConcluidos) || 0;
  const total = Number(f?.totalPedidosMes) || 0;
  const pct = total > 0 ? Math.min(100, Math.round((finalized / total) * 100)) : 0;
  const critical = stock?.criticalProducts ?? [];
  const variation =
    comparison != null
      ? computeVariationPct(comparison.current, comparison.previous)
      : 0;

  const useOrderedLayout = editMode || !isDefaultOverviewOrder(cardOrder);

  const renderExpedicaoCard = () => (
    <MobileCollapsibleSection title="Expedição" mobileAlwaysOpen>
    <section className="overview-block" aria-label="Expedição">
      <div className="overview-hero">
        <span
          className={`overview-hero-value ${atrasados > 0 ? 'overview-hero-value--danger' : ''}`}
        >
          {formatNumber(atrasados)}
        </span>
        <span className="overview-label">Atrasados</span>
      </div>

      {f && fluxo ? (
        <>
          <div className="overview-stat-grid dash-mobile-metrics-grid">
            <div className="overview-stat-cell">
              <div className="overview-label">Total</div>
              <div className="overview-stat-value">{formatNumber(total)}</div>
            </div>
            <div className="overview-stat-cell">
              <div className="overview-label">Finalizados</div>
              <div className="overview-stat-value">{formatNumber(finalized)}</div>
            </div>
            <div className="overview-stat-cell">
              <div className="overview-label">Em separação</div>
              <div className="overview-stat-value">{formatNumber(fluxo.EM_SEPARACAO)}</div>
            </div>
            <div className="overview-stat-cell">
              <div className="overview-label">Aguard. NF</div>
              <div className="overview-stat-value">{formatNumber(fluxo.AGUARDANDO_NF)}</div>
            </div>
          </div>

          <div className="overview-progress overview-desktop-only">
            <div className="overview-progress-meta">
              <span className="overview-label">Finalizados / total</span>
              <span>
                {formatNumber(finalized)} / {formatNumber(total)} ({pct}%)
              </span>
            </div>
            <div className="overview-progress-track">
              <div className="overview-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </>
      ) : (
        <p className="overview-empty">Dados indisponíveis.</p>
      )}

      <div className="overview-scroll overview-desktop-only">
        {delayed.length === 0 ? (
          <p className="overview-empty">Nenhum pedido atrasado.</p>
        ) : (
          delayed.map((row) => (
            <div key={row.id} className="overview-list-row">
              <div className="overview-list-main">
                <div className="overview-list-title">Pedido {row.pedido}</div>
                <div className="overview-list-sub">{row.recebedor}</div>
              </div>
              <span className="overview-badge-danger">{formatNumber(row.diasAtraso)}d</span>
            </div>
          ))
        )}
      </div>
    </section>
    </MobileCollapsibleSection>
  );

  const renderEstoqueCard = () => (
    <MobileCollapsibleSection title="Estoque" mobileAlwaysOpen>
    <section className="overview-block" aria-label="Estoque">
      <div className="overview-hero">
        <span
          className={`overview-hero-value ${zeroCount > 0 ? 'overview-hero-value--danger' : ''}`}
        >
          {formatNumber(zeroCount)}
        </span>
        <span className="overview-label">Estoque zerado</span>
      </div>

      {stock ? (
        <div className="overview-stat-grid overview-stat-grid--2 dash-mobile-metrics-grid">
          <div className="overview-stat-cell">
            <div className="overview-label">Produtos ativos</div>
            <div className="overview-stat-value">{formatNumber(stock.activeProducts)}</div>
          </div>
          <div className="overview-stat-cell">
            <div className="overview-label">Valor em estoque</div>
            <div className="overview-stat-value">{formatCurrency(stock.valorEstoque)}</div>
          </div>
        </div>
      ) : (
        <p className="overview-empty">Dados indisponíveis.</p>
      )}

      <div className="overview-scroll overview-desktop-only">
        {critical.length === 0 ? (
          <p className="overview-empty">Nenhum produto crítico.</p>
        ) : (
          critical.map((p) => (
            <div key={p.id} className="overview-list-row">
              <div className="overview-list-main">
                <div className="overview-list-title">
                  {p.sku} · {p.name}
                </div>
                <div className="overview-list-sub">
                  Estoque {formatNumber(p.stockQty)} · mín. {formatNumber(p.minStock)}
                </div>
              </div>
              {p.stockQty <= 0 ? (
                <span className="overview-badge-danger">Zerado</span>
              ) : (
                <span className="text-[10px] font-semibold tabular-nums text-amber-400">
                  −{formatNumber(p.deficit)}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </section>
    </MobileCollapsibleSection>
  );

  const renderFinanceiroCard = () => (
    <MobileCollapsibleSection
      title="Financeiro"
      mobileAlwaysOpen
      mobileCardClassName="dash-mobile-module-card--finance"
    >
    <section className="overview-block overview-block--finance" aria-label="Financeiro">
      <div className="overview-finance-layout">
        <div className="overview-finance-metrics">
          {fin ? (
            <>
              <div className="overview-hero md:hidden">
                <span className="overview-hero-value">
                  {formatCurrency(fin.valorPedidosPeriodo)}
                </span>
                <span className="overview-label">Pedidos período</span>
              </div>
              <div className="overview-finance-metrics-row">
                <div className="overview-metric-cell">
                  <div className="overview-label">Pedidos período</div>
                  <div className="overview-metric-value">
                    {formatCurrency(fin.valorPedidosPeriodo)}
                  </div>
                </div>
                <div className="overview-metric-cell">
                  <div className="overview-label">Faturado período</div>
                  <div className="overview-metric-value">
                    {formatCurrency(fin.valorFaturadoPeriodo)}
                  </div>
                </div>
                <div className="overview-metric-cell">
                  <div className="overview-label">Hist. pedidos</div>
                  <div className="overview-metric-value">
                    {formatCurrency(fin.valorPedidosHistorico)}
                  </div>
                </div>
                <div className="overview-metric-cell">
                  <div className="overview-label">Hist. faturado</div>
                  <div className="overview-metric-value">
                    {formatCurrency(fin.valorFaturadoHistorico)}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="overview-empty">Dados indisponíveis.</p>
          )}

          {comparePrevious && comparison ? (
            <div className="overview-compare-strip overview-desktop-only">
              <span>
                Atual: <strong>{formatCurrency(comparison.current)}</strong>
              </span>
              <span>
                Anterior: <strong>{formatCurrency(comparison.previous)}</strong>
              </span>
              <span
                className={
                  variation > 0
                    ? 'text-emerald-400'
                    : variation < 0
                      ? 'text-red-400'
                      : ''
                }
              >
                {formatPercent(Math.abs(variation))} vs anterior
              </span>
            </div>
          ) : null}
        </div>

        <div className="overview-finance-chart dash-mobile-chart overview-desktop-only">
          <button
            type="button"
            className={`overview-compare-toggle ${comparePrevious ? 'overview-compare-toggle--on' : ''}`}
            disabled={!periodHasRange || comparisonLoading}
            title={
              periodHasRange
                ? undefined
                : 'Selecione um período com datas De/Até para comparar'
            }
            onClick={() => setComparePrevious((v) => !v)}
          >
            Comparar período anterior
          </button>
          {chart !== null ? (
            <OverviewFinanceChart points={chart} />
          ) : (
            <OverviewFinanceChartSkeleton />
          )}
        </div>
      </div>
    </section>
    </MobileCollapsibleSection>
  );

  const renderCardById = (cardId: OverviewCardId) => {
    if (cardId === 'expedicao') return renderExpedicaoCard();
    if (cardId === 'estoque') return renderEstoqueCard();
    return renderFinanceiroCard();
  };

  const wrapCard = (cardId: OverviewCardId, content: ReactNode, className?: string) => (
    <OverviewDraggableCard
      key={cardId}
      cardId={cardId}
      editMode={editMode}
      onReorder={reorderCards}
      className={className}
    >
      {content}
    </OverviewDraggableCard>
  );

  return (
    <div className="dash-overview-panel">
      {errors.length > 0 ? (
        <p className="px-3 pt-2 text-xs text-red-400" role="alert">
          Alguns blocos não carregaram: {errors.join(', ')}.
        </p>
      ) : null}

      <div
        className={`dash-overview-grid ${useOrderedLayout ? 'dash-overview-grid--ordered' : ''}`}
      >
        {useOrderedLayout ? (
          cardOrder.map((cardId) =>
            wrapCard(
              cardId,
              renderCardById(cardId),
              cardId === 'financeiro' ? 'dash-overview-card-wrap--full' : undefined,
            ),
          )
        ) : (
          <>
            <div className="dash-overview-row-top">
              {wrapCard('expedicao', renderExpedicaoCard())}
              {wrapCard('estoque', renderEstoqueCard())}
            </div>
            {wrapCard('financeiro', renderFinanceiroCard())}
          </>
        )}
      </div>
    </div>
  );
}
