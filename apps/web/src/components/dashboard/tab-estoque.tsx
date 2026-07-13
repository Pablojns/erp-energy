'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DASH_SCROLL } from '@/src/components/dashboard/scroll-classes';
import { Boxes, PackageX, Warehouse } from 'lucide-react';
import {
  CategoryPieChart,
  CategoryPieChartSkeleton,
} from '@/src/components/dashboard/category-pie-chart';
import { MetricCard, MetricCardSkeleton } from '@/src/components/dashboard/metric-card';
import type { DateRange, ProductListItem, StockMovementRow, StockSummaryData } from '@/src/components/dashboard/types';
import {
  fetchProductsForCategories,
  fetchRecentStockMovements,
  fetchStockSummary,
  formatCurrency,
  formatDateBr,
  formatNumber,
} from '@/src/components/dashboard/utils';

type TabEstoqueProps = {
  period: DateRange;
  refreshKey: number;
};

function StockLevelBar({ qty, min }: { qty: number; min: number }) {
  const pct = min > 0 ? Math.min(100, Math.round((qty / min) * 100)) : qty > 0 ? 100 : 0;
  const tone = qty <= 0 ? 'danger' : qty < min ? 'warning' : 'default';
  return (
    <div className="dash-stock-level">
      <div
        className={`dash-stock-level-fill ${tone === 'danger' ? 'dash-stock-level-fill--danger' : tone === 'warning' ? 'dash-stock-level-fill--warning' : ''}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function TabEstoque({ period, refreshKey }: TabEstoqueProps) {
  const [summary, setSummary] = useState<StockSummaryData | null>(null);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, p, m] = await Promise.all([
        fetchStockSummary(period),
        fetchProductsForCategories().catch(() => [] as ProductListItem[]),
        fetchRecentStockMovements(period),
      ]);
      setSummary(s);
      setProducts(p);
      setMovements(m);
    } catch (e) {
      setSummary(null);
      setError(e instanceof Error ? e.message : 'Erro ao carregar estoque.');
    } finally {
      setLoading(false);
    }
  }, [period.dataInicio, period.dataFim]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const zeroCount = useMemo(
    () => (summary?.criticalProducts ?? []).filter((p) => p.stockQty <= 0).length,
    [summary],
  );

  const categorySlices = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      const label = p.category?.trim() || 'Sem categoria';
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [products]);

  const critical = summary?.criticalProducts ?? [];

  if (loading) {
    return (
      <div className="dash-tab-panel">
        <div className="dash-card-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>
        <CategoryPieChartSkeleton />
        <div className="dash-card w-full space-y-3 p-4 md:p-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="dash-skeleton h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <p className="dash-section-error" role="alert">{error}</p>;
  }

  return (
    <div className="dash-tab-panel">
      {summary ? (
        <div className="dash-card-grid">
          <MetricCard label="Produtos ativos" value={formatNumber(summary.activeProducts)} icon={Boxes} />
          <MetricCard label="Estoque zerado" value={formatNumber(zeroCount)} icon={PackageX} tone={zeroCount > 0 ? 'danger' : 'default'} />
          <MetricCard label="Valor em estoque" value={formatCurrency(summary.valorEstoque)} icon={Warehouse} />
        </div>
      ) : null}

      <div className="dash-card w-full p-4 md:p-6">
        <h3 className="mb-3 text-sm font-semibold text-[var(--dash-text)]">Produtos críticos</h3>
        {critical.length === 0 ? (
          <p className="text-sm text-[var(--dash-text-muted)]">Nenhum produto crítico.</p>
        ) : (
          <div className={`${DASH_SCROLL}`}>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Nome</th>
                  <th>Atual</th>
                  <th>Mínimo</th>
                  <th>Nível</th>
                </tr>
              </thead>
              <tbody>
                {critical.map((p) => (
                  <tr key={p.id}>
                    <td>{p.sku}</td>
                    <td>{p.name}</td>
                    <td>{formatNumber(p.stockQty)}</td>
                    <td>{formatNumber(p.minStock)}</td>
                    <td>
                      <StockLevelBar qty={p.stockQty} min={p.minStock} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {categorySlices.length > 0 ? (
        <CategoryPieChart slices={categorySlices} />
      ) : (
        <CategoryPieChartSkeleton />
      )}

      <div className="dash-card w-full p-4 md:p-6">
        <h3 className="mb-3 text-sm font-semibold text-[var(--dash-text)]">Movimentações recentes</h3>
        {movements.length === 0 ? (
          <p className="text-sm text-[var(--dash-text-muted)]">Sem movimentações no período.</p>
        ) : (
          <div className={DASH_SCROLL}>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Tipo</th>
                  <th>Qtd</th>
                  <th>Data</th>
                  <th>Responsável</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="font-medium">{m.productName}</div>
                      <div className="text-xs text-[var(--dash-text-muted)]">{m.productSku}</div>
                    </td>
                    <td>{m.tipo}</td>
                    <td>{formatNumber(m.quantity)}</td>
                    <td>{formatDateBr(m.movementDate)}</td>
                    <td>{m.movedByName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
