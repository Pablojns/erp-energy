'use client';

import { LayoutDashboard, Plus, RotateCcw } from 'lucide-react';
import { PeriodSelector } from '@/src/components/dashboard/period-selector';
import type { DashboardTabId, PeriodPreset } from '@/src/components/dashboard/types';

const TABS: { id: DashboardTabId; label: string; shortLabel: string }[] = [
  { id: 'overview', label: 'Visão Geral', shortLabel: 'Visão' },
  { id: 'financeiro', label: 'Financeiro', shortLabel: 'Financ.' },
  { id: 'expedicao', label: 'Expedição', shortLabel: 'Exped.' },
  { id: 'estoque', label: 'Estoque', shortLabel: 'Estoque' },
];

type DashboardHeaderProps = {
  activeTab: DashboardTabId;
  onTabChange: (tab: DashboardTabId) => void;
  preset: PeriodPreset;
  onPresetChange: (preset: PeriodPreset) => void;
  onNewOrderClick: () => void;
  overviewEditMode?: boolean;
  onOverviewEditModeChange?: (value: boolean) => void;
  onOverviewLayoutReset?: () => void;
};

export function DashboardHeader({
  activeTab,
  onTabChange,
  preset,
  onPresetChange,
  onNewOrderClick,
  overviewEditMode = false,
  onOverviewEditModeChange,
  onOverviewLayoutReset,
}: DashboardHeaderProps) {
  const showOverviewLayoutControls =
    activeTab === 'overview' &&
    onOverviewEditModeChange != null &&
    onOverviewLayoutReset != null;
  return (
    <header className="dash-fixed-header w-full">
      <div className="dash-shell w-full space-y-4 pb-4">
        <nav
          className="dash-header-tabs flex flex-nowrap gap-2 overflow-x-auto"
          aria-label="Abas do dashboard"
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={
                  isActive
                    ? 'dash-header-tab shrink-0 whitespace-nowrap rounded-lg border border-[#2AACE2]/50 px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_15px_rgba(42,172,226,0.32)] transition-transform -translate-y-px'
                    : 'dash-header-tab shrink-0 whitespace-nowrap rounded-lg border border-[var(--dash-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--dash-text-muted)] shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-colors hover:text-[#2AACE2]'
                }
                style={
                  isActive
                    ? {
                        background: 'linear-gradient(to right, #2AACE2, #5BBFB0)',
                      }
                    : {
                        background: '#ffffff',
                      }
                }
              >
                <span className="dash-header-tab-label-full">{tab.label}</span>
                <span className="dash-header-tab-label-short">{tab.shortLabel}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <PeriodSelector preset={preset} onPresetChange={onPresetChange} />
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {showOverviewLayoutControls ? (
              <>
                <button
                  type="button"
                  className={overviewEditMode ? 'dash-btn-primary' : 'dash-btn-secondary'}
                  onClick={() => onOverviewEditModeChange?.(!overviewEditMode)}
                >
                  <LayoutDashboard size={16} strokeWidth={1.75} />
                  {overviewEditMode ? 'Concluir' : 'Personalizar'}
                </button>
                {overviewEditMode ? (
                  <button
                    type="button"
                    className="dash-btn-secondary"
                    onClick={() => onOverviewLayoutReset?.()}
                  >
                    <RotateCcw size={16} strokeWidth={1.75} />
                    Resetar layout
                  </button>
                ) : null}
              </>
            ) : null}
            <button type="button" className="dash-btn-primary" onClick={onNewOrderClick}>
              <Plus size={16} strokeWidth={2} />
              Novo Pedido
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
