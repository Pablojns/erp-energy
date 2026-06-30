'use client';

import type { DashboardTabId } from '@/src/components/dashboard/types';

const TABS: { id: DashboardTabId; label: string }[] = [
  { id: 'overview', label: 'Visão Geral' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'expedicao', label: 'Expedição' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'alertas', label: 'Alertas' },
];

type DashboardTabsProps = {
  active: DashboardTabId;
  onChange: (tab: DashboardTabId) => void;
};

export function DashboardTabs({ active, onChange }: DashboardTabsProps) {
  return (
    <nav className="dash-tabs" aria-label="Abas do dashboard">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`dash-tab ${active === tab.id ? 'dash-tab--active' : ''}`}
          onClick={() => onChange(tab.id)}
          aria-current={active === tab.id ? 'page' : undefined}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
