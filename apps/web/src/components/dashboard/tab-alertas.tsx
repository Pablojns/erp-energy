'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DASH_SCROLL } from '@/src/components/dashboard/scroll-classes';
import Link from 'next/link';
import { AlertTriangle, FileWarning, PackageX } from 'lucide-react';
import { RecentActivities, RecentActivitiesSkeleton } from '@/src/components/dashboard/recent-activities';
import type {
  DashboardAtividade,
  DashboardResumo,
  DateRange,
  DelayedOrderRow,
  NfAlertRow,
} from '@/src/components/dashboard/types';
import {
  fetchDashboardResumo,
  fetchStockSummary,
  formatCurrency,
  formatNumber,
} from '@/src/components/dashboard/utils';
import { getOverdueDays } from '@/src/components/expedicao/shared/order-helpers';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { normalizePedidoFromApi, pedidosListFetchInit } from '@/src/services/api/pedidos-normalize';

type TabAlertasProps = {
  period: DateRange;
  refreshKey: number;
};

type AdminUser = { id: string; name: string };

export function TabAlertas({ period, refreshKey }: TabAlertasProps) {
  const [resumo, setResumo] = useState<DashboardResumo | null>(null);
  const [delayed, setDelayed] = useState<DelayedOrderRow[]>([]);
  const [nfs, setNfs] = useState<NfAlertRow[]>([]);
  const [critical, setCritical] = useState<
    Array<{ id: string; sku: string; name: string; stockQty: number; minStock: number }>
  >([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, stock, nfsPage, users, pedidosPage] = await Promise.all([
        fetchDashboardResumo(period),
        fetchStockSummary(period),
        erpFetchJson<{
          data: Array<{ id: string; pedido: string; valor: number; diasEmAberto: number }>;
        }>('api/financeiro/nfs-em-aberto?page=1&pageSize=100'),
        erpFetchJson<AdminUser[]>('auth/users').catch(() => [] as AdminUser[]),
        erpFetchJson<{ data: Record<string, unknown>[] }>(
          'api/pedidos?status=delayed&pageSize=100&page=1',
          pedidosListFetchInit,
        ),
      ]);

      setResumo(r);
      setCritical(stock.criticalProducts ?? []);
      setNfs(
        nfsPage.data.map((nf) => ({
          id: nf.id,
          pedido: nf.pedido,
          valor: Number(nf.valor) || 0,
          diasEmAberto: Number(nf.diasEmAberto) || 0,
        })),
      );

      const map: Record<string, string> = {};
      for (const u of users) map[u.id] = u.name;
      setUserNames(map);

      setDelayed(
        pedidosPage.data.map((raw) => {
          const p = normalizePedidoFromApi(raw);
          return {
            id: p.id,
            pedido: p.externalOrderNumber ?? p.code,
            recebedor: p.receiverName ?? p.customerName ?? '—',
            diasAtraso: getOverdueDays(p) ?? 0,
          };
        }),
      );
    } catch {
      setResumo(null);
      setDelayed([]);
      setNfs([]);
      setCritical([]);
    } finally {
      setLoading(false);
    }
  }, [period.dataInicio, period.dataFim]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const critPedidos = useMemo(
    () => delayed.filter((d) => d.diasAtraso > 30),
    [delayed],
  );
  const atencaoPedidos = useMemo(
    () => delayed.filter((d) => d.diasAtraso > 0 && d.diasAtraso <= 30),
    [delayed],
  );
  const critProdutos = useMemo(
    () => critical.filter((p) => p.stockQty <= 0),
    [critical],
  );
  const atencaoProdutos = useMemo(
    () => critical.filter((p) => p.stockQty > 0 && p.stockQty < p.minStock),
    [critical],
  );
  const critNfs = useMemo(() => nfs.filter((n) => n.diasEmAberto > 12), [nfs]);
  const atencaoNfs = useMemo(
    () => nfs.filter((n) => n.diasEmAberto > 0 && n.diasEmAberto <= 12),
    [nfs],
  );

  if (loading) {
    return (
      <div className="dash-tab-panel dash-grid-2">
        <div className="dash-card w-full space-y-3 p-4 md:p-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="dash-skeleton h-14 w-full rounded-lg" />
          ))}
        </div>
        <RecentActivitiesSkeleton />
      </div>
    );
  }

  return (
    <div className="dash-tab-panel">
      <div className="dash-grid-2">
        <div className="space-y-4">
          <div>
            <h2 className="dash-subsection-title">Críticos</h2>
            <ul className={`space-y-2 ${DASH_SCROLL} max-h-[40vh]`}>
              {critPedidos.map((p) => (
                <li key={p.id}>
                  <Link href="/app/expedicao/pedidos" className="dash-alert-item dash-alert-item--danger">
                    <AlertTriangle size={18} className="shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">Pedido {p.pedido} — {formatNumber(p.diasAtraso)}d atrasado</p>
                      <p className="text-xs text-[var(--dash-text-muted)]">{p.recebedor}</p>
                    </div>
                  </Link>
                </li>
              ))}
              {critProdutos.map((p) => (
                <li key={p.id}>
                  <Link href="/app/estoque" className="dash-alert-item dash-alert-item--danger">
                    <PackageX size={18} className="shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">Estoque zerado: {p.sku}</p>
                      <p className="text-xs text-[var(--dash-text-muted)]">{p.name}</p>
                    </div>
                  </Link>
                </li>
              ))}
              {critNfs.map((nf) => (
                <li key={nf.id}>
                  <Link href="/app/financeiro" className="dash-alert-item dash-alert-item--danger">
                    <FileWarning size={18} className="shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">NF {nf.pedido} — {formatNumber(nf.diasEmAberto)}d em aberto</p>
                      <p className="text-xs text-[var(--dash-text-muted)]">{formatCurrency(nf.valor)}</p>
                    </div>
                  </Link>
                </li>
              ))}
              {critPedidos.length === 0 && critProdutos.length === 0 && critNfs.length === 0 ? (
                <p className="text-sm text-[var(--dash-text-muted)]">Nenhum item crítico.</p>
              ) : null}
            </ul>
          </div>

          <div>
            <h2 className="dash-subsection-title">Atenção</h2>
            <ul className={`space-y-2 ${DASH_SCROLL} max-h-[40vh]`}>
              {atencaoPedidos.slice(0, 10).map((p) => (
                <li key={p.id}>
                  <Link href="/app/expedicao/pedidos" className="dash-alert-item dash-alert-item--warning">
                    <AlertTriangle size={18} className="shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">Pedido {p.pedido} — {formatNumber(p.diasAtraso)}d</p>
                      <p className="text-xs text-[var(--dash-text-muted)]">{p.recebedor}</p>
                    </div>
                  </Link>
                </li>
              ))}
              {atencaoProdutos.slice(0, 10).map((p) => (
                <li key={p.id}>
                  <Link href="/app/estoque" className="dash-alert-item dash-alert-item--warning">
                    <PackageX size={18} className="shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">Estoque baixo: {p.sku}</p>
                      <p className="text-xs text-[var(--dash-text-muted)]">
                        {formatNumber(p.stockQty)} / mín. {formatNumber(p.minStock)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
              {atencaoNfs.slice(0, 10).map((nf) => (
                <li key={nf.id}>
                  <Link href="/app/financeiro" className="dash-alert-item dash-alert-item--warning">
                    <FileWarning size={18} className="shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">NF {nf.pedido} — {formatNumber(nf.diasEmAberto)}d</p>
                    </div>
                  </Link>
                </li>
              ))}
              {atencaoPedidos.length === 0 &&
              atencaoProdutos.length === 0 &&
              atencaoNfs.length === 0 ? (
                <p className="text-sm text-[var(--dash-text-muted)]">Nenhum item em atenção.</p>
              ) : null}
            </ul>
          </div>
        </div>

        {resumo ? (
          <RecentActivities
            items={resumo.atividadesRecentes as DashboardAtividade[]}
            userNames={userNames}
          />
        ) : (
          <RecentActivitiesSkeleton />
        )}
      </div>
    </div>
  );
}
