'use client';

import { useCallback, useEffect, useState } from 'react';
import { DASH_SCROLL } from '@/src/components/dashboard/scroll-classes';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  Package,
  ShoppingCart,
} from 'lucide-react';
import { MetricCard, MetricCardSkeleton } from '@/src/components/dashboard/metric-card';
import {
  StatusBarChart,
  StatusBarChartSkeleton,
} from '@/src/components/dashboard/status-bar-chart';
import type { DashboardResumo, DateRange, DelayedOrderRow } from '@/src/components/dashboard/types';
import {
  fetchDashboardResumo,
  formatNumber,
} from '@/src/components/dashboard/utils';
import { getOverdueDays } from '@/src/components/expedicao/shared/order-helpers';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { normalizePedidoFromApi, pedidosListFetchInit } from '@/src/services/api/pedidos-normalize';

type TabExpedicaoProps = {
  period: DateRange;
  refreshKey: number;
};

function ProgressBlock({ finalized, total }: { finalized: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((finalized / total) * 100)) : 0;
  return (
    <div className="dash-card w-full p-4 md:p-6">
      <div className="mb-2 flex justify-between text-sm">
        <span className="font-medium text-[var(--dash-text)]">Progresso de finalização</span>
        <span className="tabular-nums text-[var(--dash-text-muted)]">
          {formatNumber(finalized)} / {formatNumber(total)} ({pct}%)
        </span>
      </div>
      <div className="dash-progress-track">
        <div className="dash-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function TabExpedicao({ period, refreshKey }: TabExpedicaoProps) {
  const [resumo, setResumo] = useState<DashboardResumo | null>(null);
  const [delayed, setDelayed] = useState<DelayedOrderRow[]>([]);
  const [loadingResumo, setLoadingResumo] = useState(true);
  const [loadingDelayed, setLoadingDelayed] = useState(true);
  const [errorResumo, setErrorResumo] = useState<string | null>(null);

  const loadResumo = useCallback(async () => {
    setLoadingResumo(true);
    setErrorResumo(null);
    try {
      setResumo(await fetchDashboardResumo(period));
    } catch (e) {
      setResumo(null);
      setErrorResumo(e instanceof Error ? e.message : 'Erro ao carregar expedição.');
    } finally {
      setLoadingResumo(false);
    }
  }, [period.dataInicio, period.dataFim]);

  const loadDelayed = useCallback(async () => {
    setLoadingDelayed(true);
    try {
      const res = await erpFetchJson<{ data: Record<string, unknown>[] }>(
        'api/pedidos?status=delayed&pageSize=5&page=1&sortBy=requestedDeliveryDate&sortOrder=asc',
        pedidosListFetchInit,
      );
      const rows = res.data
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
        .slice(0, 5);
      setDelayed(rows);
    } catch {
      setDelayed([]);
    } finally {
      setLoadingDelayed(false);
    }
  }, []);

  useEffect(() => {
    void loadResumo();
    void loadDelayed();
  }, [loadResumo, loadDelayed, refreshKey]);

  const f = resumo?.financeiro;
  const fluxo = resumo?.fluxo;
  const atrasados = Number(f?.pedidosAtrasados) || 0;

  return (
    <div className="dash-tab-panel">
      {loadingResumo ? (
        <div className="dash-card-grid">
          {Array.from({ length: 5 }).map((_, i) => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>
      ) : errorResumo ? (
        <p className="dash-section-error" role="alert">{errorResumo}</p>
      ) : f && fluxo ? (
        <>
          <div className="dash-card-grid">
            <MetricCard label="Total Pedidos" value={formatNumber(f.totalPedidosMes)} icon={ShoppingCart} />
            <MetricCard label="Finalizados" value={formatNumber(f.pedidosConcluidos)} icon={CheckCircle2} tone="success" />
            <MetricCard label="Atrasados" value={formatNumber(atrasados)} icon={AlertTriangle} tone={atrasados > 0 ? 'danger' : 'default'} />
            <MetricCard label="Em Separação" value={formatNumber(fluxo.EM_SEPARACAO)} icon={Package} />
            <MetricCard label="Aguardando NF" value={formatNumber(fluxo.AGUARDANDO_NF)} icon={FileWarning} tone={fluxo.AGUARDANDO_NF > 0 ? 'warning' : 'default'} />
          </div>
          <ProgressBlock finalized={f.pedidosConcluidos} total={f.totalPedidosMes} />
          <StatusBarChart fluxo={fluxo} />
        </>
      ) : null}

      <div className="dash-grid-2">
        <div className="dash-card w-full p-4 md:p-6">
          <h3 className="text-sm font-semibold text-[var(--dash-text)]">Top 5 pedidos atrasados</h3>
          {loadingDelayed ? (
            <div className="mt-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="dash-skeleton h-10 w-full" />
              ))}
            </div>
          ) : delayed.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--dash-text-muted)]">Nenhum pedido atrasado.</p>
          ) : (
            <ul className={`mt-4 ${DASH_SCROLL} max-h-[300px]`}>
              {delayed.map((row) => (
                <li key={row.id}>
                  <Link href="/app/expedicao/pedidos" className="dash-link-row">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.pedido}</p>
                      <p className="truncate text-xs text-[var(--dash-text-muted)]">{row.recebedor}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-[var(--dash-danger)]">
                      {formatNumber(row.diasAtraso)}d
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="dash-card w-full p-4 md:p-6">
          <h3 className="text-sm font-semibold text-[var(--dash-text)]">Top 5 transportadoras</h3>
          {loadingResumo ? (
            <div className="mt-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="dash-skeleton h-10 w-full" />
              ))}
            </div>
          ) : !resumo?.topTransportadoras.length ? (
            <p className="mt-4 text-sm text-[var(--dash-text-muted)]">Sem saídas no período.</p>
          ) : (
            <ul className={`mt-4 ${DASH_SCROLL} max-h-[300px]`}>
              {resumo.topTransportadoras.map((t) => (
                <li key={t.nome} className="dash-list-row">
                  <span className="truncate text-sm">{t.nome}</span>
                  <span className="text-sm font-semibold tabular-nums">{formatNumber(t.total)} saídas</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
