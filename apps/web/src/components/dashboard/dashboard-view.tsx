'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardHeader } from '@/src/components/dashboard/dashboard-header';
import { useNavPermissions } from '@/src/components/layout/nav-permissions-context';
import { TabOverview } from '@/src/components/dashboard/tab-overview';
import { TabExpedicao } from '@/src/components/dashboard/tab-expedicao';
import { TabFinanceiro } from '@/src/components/dashboard/tab-financeiro';
import { TabEstoque } from '@/src/components/dashboard/tab-estoque';
import { NewOrderModal } from '@/src/components/expedicao/workspace/new-order-modal';
import type { OverviewModuleFilter } from '@/src/components/dashboard/types';
import { getCurrentMonthRange } from '@/src/components/compras/compras-period-filter';
import { normalizeDateRange } from '@/src/lib/period-range';
import '@/src/components/dashboard/dashboard.css';

export function DashboardView() {
  const { user } = useNavPermissions();
  const router = useRouter();

  const [overviewModule, setOverviewModule] = useState<OverviewModuleFilter>('geral');
  const initialMonth = getCurrentMonthRange();
  const [dateFrom, setDateFrom] = useState(initialMonth.from);
  const [dateTo, setDateTo] = useState(initialMonth.to);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [refreshKey] = useState(0);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = mainRef.current?.querySelector('.dash-overview-panel, .dash-tab-panel');
    panel?.scrollTo(0, 0);
  }, [overviewModule]);

  const period = useMemo(
    () =>
      normalizeDateRange({
        dataInicio: dateFrom,
        dataFim: dateTo,
      }),
    [dateFrom, dateTo],
  );

  const handlePeriodChange = useCallback((from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
  }, []);

  const handlePrimaryClick = useCallback(() => {
    if (overviewModule === 'financeiro') {
      router.push('/app/financeiro');
      return;
    }
    setNewOrderOpen(true);
  }, [overviewModule, router]);

  return (
    <div className="erp-dashboard w-full min-h-0 flex flex-col">
      <DashboardHeader
        dateFrom={dateFrom}
        dateTo={dateTo}
        onPeriodChange={handlePeriodChange}
        overviewModule={overviewModule}
        onOverviewModuleChange={setOverviewModule}
        onPrimaryClick={handlePrimaryClick}
      />

      <div ref={mainRef} className="dash-scroll-main">
        {overviewModule === 'geral' ? (
          <TabOverview
            period={period}
            refreshKey={refreshKey}
            onNavigateTab={(tab) => setOverviewModule(tab)}
            onNewOrderClick={() => setNewOrderOpen(true)}
            userId={user.id}
          />
        ) : overviewModule === 'expedicao' ? (
          <TabExpedicao period={period} refreshKey={refreshKey} />
        ) : overviewModule === 'financeiro' ? (
          <TabFinanceiro period={period} refreshKey={refreshKey} />
        ) : (
          <TabEstoque period={period} refreshKey={refreshKey} />
        )}
      </div>

      <NewOrderModal
        isOpen={newOrderOpen}
        onClose={() => setNewOrderOpen(false)}
        onCreated={() => setNewOrderOpen(false)}
      />
    </div>
  );
}
