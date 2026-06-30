'use client';

import Link from 'next/link';
import { Package, Plus } from 'lucide-react';
import { PeriodSelector } from '@/src/components/dashboard/period-selector';
import type { DashboardTabId, PeriodPreset } from '@/src/components/dashboard/types';

const TABS: { id: DashboardTabId; label: string }[] = [
  { id: 'overview', label: 'Visão Geral' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'expedicao', label: 'Expedição' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'alertas', label: 'Alertas' },
];

type DashboardHeaderProps = {
  activeTab: DashboardTabId;
  onTabChange: (tab: DashboardTabId) => void;
  preset: PeriodPreset;
  customInicio: string;
  customFim: string;
  onPresetChange: (preset: PeriodPreset) => void;
  onCustomInicioChange: (value: string) => void;
  onCustomFimChange: (value: string) => void;
};

export function DashboardHeader({
  activeTab,
  onTabChange,
  preset,
  customInicio,
  customFim,
  onPresetChange,
  onCustomInicioChange,
  onCustomFimChange,
}: DashboardHeaderProps) {
  return (
    <header className="dash-fixed-header w-full">
      <div className="dash-shell w-full space-y-4 pb-4">
        <nav
          className="flex flex-wrap gap-2 overflow-x-auto"
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
                    ? 'rounded-lg border border-blue-400/50 px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_15px_rgba(37,99,235,0.4)] transition-transform -translate-y-px'
                    : 'rounded-lg border border-white/20 bg-transparent px-4 py-2 text-sm font-semibold text-zinc-400 shadow-[0_2px_8px_rgba(0,0,0,0.12)] transition-colors hover:text-zinc-300'
                }
                style={
                  isActive
                    ? {
                        background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                      }
                    : {
                        background:
                          'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
                      }
                }
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <PeriodSelector
              preset={preset}
              customInicio={customInicio}
              customFim={customFim}
              onPresetChange={onPresetChange}
              onCustomInicioChange={onCustomInicioChange}
              onCustomFimChange={onCustomFimChange}
            />
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Link href="/app/expedicao/pedidos" className="dash-btn-primary">
              <Plus size={16} strokeWidth={2} />
              Novo Pedido
            </Link>
            <Link href="/app/expedicao/separacao" className="dash-btn-secondary">
              <Package size={16} strokeWidth={1.75} />
              Separação Rápida
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
