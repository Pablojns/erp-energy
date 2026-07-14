'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DashboardHeader } from '@/src/components/dashboard/dashboard-header';
import { useNavPermissions } from '@/src/components/layout/nav-permissions-context';
import { TabEstoque } from '@/src/components/dashboard/tab-estoque';
import { TabExpedicao } from '@/src/components/dashboard/tab-expedicao';
import { TabFinanceiro } from '@/src/components/dashboard/tab-financeiro';
import { TabOverview } from '@/src/components/dashboard/tab-overview';
import { NewOrderModal } from '@/src/components/expedicao/workspace/new-order-modal';
import type { DashboardTabId, PeriodPreset } from '@/src/components/dashboard/types';
import { resolvePeriodRange } from '@/src/components/dashboard/utils';
import '@/src/components/dashboard/dashboard.css';

export function DashboardView() {
  const { user } = useNavPermissions();

  const [activeTab, setActiveTab] = useState<DashboardTabId>('overview');
  const [overviewEditMode, setOverviewEditMode] = useState(false);
  const [overviewLayoutResetKey, setOverviewLayoutResetKey] = useState(0);
  const [preset, setPreset] = useState<PeriodPreset>('mes');
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [refreshKey] = useState(0);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = mainRef.current?.querySelector('.dash-tab-panel');
    panel?.scrollTo(0, 0);
  }, [activeTab]);

  const period = useMemo(() => resolvePeriodRange(preset), [preset]);

  const handleOverviewLayoutReset = useCallback(() => {
    setOverviewLayoutResetKey((k) => k + 1);
  }, []);

  const handlePresetChange = (next: PeriodPreset) => {
    setPreset(next);
  };

  return (
    <div className="erp-dashboard w-full min-h-0 flex flex-col">
      <DashboardHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        preset={preset}
        onPresetChange={handlePresetChange}
        onNewOrderClick={() => setNewOrderOpen(true)}
        overviewEditMode={overviewEditMode}
        onOverviewEditModeChange={setOverviewEditMode}
        onOverviewLayoutReset={handleOverviewLayoutReset}
      />

      {/* div, não <main>: já existe um <main> no AppShell — dois <main>
          aninhados são semanticamente inválidos e fazem seletores como
          `.erp-app-bg main` (descendente) baterem nos dois, duplicando
          padding. */}
      <div ref={mainRef} className="dash-scroll-main">
        {activeTab === 'overview' ? (
          <TabOverview
            period={period}
            refreshKey={refreshKey}
            onNavigateTab={setActiveTab}
            userId={user.id}
            editMode={overviewEditMode}
            layoutResetKey={overviewLayoutResetKey}
          />
        ) : activeTab === 'financeiro' ? (
          <TabFinanceiro period={period} refreshKey={refreshKey} />
        ) : activeTab === 'expedicao' ? (
          <TabExpedicao period={period} refreshKey={refreshKey} />
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
