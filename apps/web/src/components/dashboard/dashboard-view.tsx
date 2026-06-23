'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertsPanel, AlertsPanelSkeleton } from '@/src/components/dashboard/alerts-panel';
import { CarriersPieChart, CarriersPieChartSkeleton } from '@/src/components/dashboard/carriers-pie-chart';
import { DashboardHeader } from '@/src/components/dashboard/dashboard-header';
import { FlowBarChart, FlowBarChartSkeleton } from '@/src/components/dashboard/flow-bar-chart';
import { MetricsGrid, MetricsGridSkeleton } from '@/src/components/dashboard/metrics-grid';
import { RecentActivities, RecentActivitiesSkeleton } from '@/src/components/dashboard/recent-activities';
import { TopReceiversTable, TopReceiversTableSkeleton } from '@/src/components/dashboard/top-receivers-table';
import type { DashboardResumo, PeriodPreset } from '@/src/components/dashboard/types';
import { formatYmd, resolvePeriodRange } from '@/src/components/dashboard/utils';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import '@/src/components/dashboard/dashboard.css';

type DashboardViewProps = {
  userName: string;
};

type AdminUser = { id: string; name: string };

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="dash-card p-5 space-y-3">
        <div className="dash-skeleton h-8 w-64" />
        <div className="dash-skeleton h-4 w-48" />
        <div className="dash-skeleton h-9 w-full max-w-xl" />
      </div>
      <MetricsGridSkeleton />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FlowBarChartSkeleton />
        <CarriersPieChartSkeleton />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <TopReceiversTableSkeleton />
        <RecentActivitiesSkeleton />
        <AlertsPanelSkeleton />
      </div>
    </div>
  );
}

export function DashboardView({ userName }: DashboardViewProps) {
  const today = formatYmd(new Date());
  const defaultRange = resolvePeriodRange('mes');

  const [preset, setPreset] = useState<PeriodPreset>('mes');
  const [customInicio, setCustomInicio] = useState(defaultRange.dataInicio);
  const [customFim, setCustomFim] = useState(defaultRange.dataFim);
  const [data, setData] = useState<DashboardResumo | null>(null);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(
    () =>
      resolvePeriodRange(preset, {
        dataInicio: customInicio || today,
        dataFim: customFim || today,
      }),
    [preset, customInicio, customFim, today],
  );

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        dataInicio: range.dataInicio,
        dataFim: range.dataFim,
      });
      const [resumo, users] = await Promise.all([
        erpFetchJson<DashboardResumo>(`api/dashboard/resumo?${qs.toString()}`),
        erpFetchJson<AdminUser[]>('auth/users').catch(() => [] as AdminUser[]),
      ]);
      setData(resumo);
      const map: Record<string, string> = {};
      for (const u of users) {
        map[u.id] = u.name;
      }
      setUserNames(map);
    } catch (e) {
      setData(null);
      setError(
        e instanceof Error ? e.message : 'Não foi possível carregar o dashboard.',
      );
    } finally {
      setLoading(false);
    }
  }, [range.dataInicio, range.dataFim]);

  useEffect(() => {
    if (preset === 'personalizado' && (!customInicio || !customFim)) {
      return;
    }
    void loadDashboard();
  }, [loadDashboard, preset, customInicio, customFim]);

  return (
    <div className="erp-dashboard">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <DashboardHeader
          userName={userName}
          preset={preset}
          customInicio={customInicio}
          customFim={customFim}
          onPresetChange={setPreset}
          onCustomInicioChange={setCustomInicio}
          onCustomFimChange={setCustomFim}
        />

        {error ? (
          <div className="dash-error-banner" role="alert">
            {error}
          </div>
        ) : null}

        {loading ? (
          <DashboardSkeleton />
        ) : data ? (
          <>
            <MetricsGrid data={data} />

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <FlowBarChart fluxo={data.fluxo} />
              <CarriersPieChart items={data.topTransportadoras} />
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <TopReceiversTable items={data.topRecebedores} />
              <RecentActivities
                items={data.atividadesRecentes}
                userNames={userNames}
              />
              <AlertsPanel alertas={data.alertas} />
            </section>
          </>
        ) : !error ? (
          <p className="text-sm text-[var(--dash-text-muted)]">Sem dados para exibir.</p>
        ) : null}
      </div>
    </div>
  );
}
