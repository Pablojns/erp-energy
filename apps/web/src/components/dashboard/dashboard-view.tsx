'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DashboardHeader } from '@/src/components/dashboard/dashboard-header';
import { TabAlertas } from '@/src/components/dashboard/tab-alertas';
import { TabEstoque } from '@/src/components/dashboard/tab-estoque';
import { TabExpedicao } from '@/src/components/dashboard/tab-expedicao';
import { TabFinanceiro } from '@/src/components/dashboard/tab-financeiro';
import { TabOverview } from '@/src/components/dashboard/tab-overview';
import type { DashboardTabId, PeriodPreset } from '@/src/components/dashboard/types';
import { resolvePeriodRange } from '@/src/components/dashboard/utils';
import '@/src/components/dashboard/dashboard.css';

export function DashboardView() {
  const defaultRange = useMemo(() => resolvePeriodRange('mes'), []);

  const [activeTab, setActiveTab] = useState<DashboardTabId>('overview');
  const [preset, setPreset] = useState<PeriodPreset>('mes');
  const [customInicio, setCustomInicio] = useState(defaultRange.dataInicio);
  const [customFim, setCustomFim] = useState(defaultRange.dataFim);
  const [refreshKey] = useState(0);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const panel = mainRef.current?.querySelector('.dash-tab-panel');
    panel?.scrollTo(0, 0);
  }, [activeTab]);

  const period = useMemo(
    () =>
      resolvePeriodRange(preset, {
        dataInicio: customInicio,
        dataFim: customFim,
      }),
    [preset, customInicio, customFim],
  );

  const periodReady =
    preset !== 'personalizado' || (Boolean(customInicio) && Boolean(customFim));

  const handlePresetChange = (next: PeriodPreset) => {
    setPreset(next);
    if (next === 'todos') {
      setCustomInicio('');
      setCustomFim('');
      return;
    }
    if (next === 'mes' || next === 'trimestre' || next === 'ano') {
      const range = resolvePeriodRange(next);
      setCustomInicio(range.dataInicio);
      setCustomFim(range.dataFim);
    }
  };

  return (
    <div className="erp-dashboard w-full min-h-0 flex flex-col">
      <DashboardHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        preset={preset}
        customInicio={customInicio}
        customFim={customFim}
        onPresetChange={handlePresetChange}
        onCustomInicioChange={(v) => {
          setPreset('personalizado');
          setCustomInicio(v);
        }}
        onCustomFimChange={(v) => {
          setPreset('personalizado');
          setCustomFim(v);
        }}
      />

      <main ref={mainRef} className="dash-scroll-main">
        {!periodReady ? (
          <p className="text-sm text-[var(--dash-text-muted)]">
            Selecione as datas De/Até para o período personalizado.
          </p>
        ) : activeTab === 'overview' ? (
          <TabOverview
            period={period}
            refreshKey={refreshKey}
            onNavigateTab={setActiveTab}
          />
        ) : activeTab === 'financeiro' ? (
          <TabFinanceiro period={period} refreshKey={refreshKey} />
        ) : activeTab === 'expedicao' ? (
          <TabExpedicao period={period} refreshKey={refreshKey} />
        ) : activeTab === 'estoque' ? (
          <TabEstoque period={period} refreshKey={refreshKey} />
        ) : (
          <TabAlertas period={period} refreshKey={refreshKey} />
        )}
      </main>
    </div>
  );
}
