'use client';

import { Plus } from 'lucide-react';
import { ComprasPeriodFilter } from '@/src/components/compras/compras-period-filter';
import { OverviewModuleFilterBar } from '@/src/components/dashboard/overview-module-filter';
import type { OverviewModuleFilter } from '@/src/components/dashboard/types';

const HEADER_META: Record<
  OverviewModuleFilter,
  { title: string; subtitle: string; cta: string }
> = {
  geral: {
    title: 'Visão Geral',
    subtitle: 'Acompanhe o desempenho geral da operação em tempo real.',
    cta: 'Novo Pedido',
  },
  expedicao: {
    title: 'Expedição',
    subtitle: 'Acompanhe o fluxo dos pedidos e a performance da expedição.',
    cta: 'Novo Pedido',
  },
  estoque: {
    title: 'Estoque',
    subtitle: 'Acompanhe o estoque, rupturas e movimentações em tempo real.',
    cta: 'Novo Pedido',
  },
  financeiro: {
    title: 'Financeiro',
    subtitle: 'Acompanhe o fluxo financeiro da sua empresa em tempo real.',
    cta: 'Nova Receita / Despesa',
  },
};

type DashboardHeaderProps = {
  dateFrom: string;
  dateTo: string;
  onPeriodChange: (from: string, to: string) => void;
  overviewModule: OverviewModuleFilter;
  onOverviewModuleChange: (module: OverviewModuleFilter) => void;
  onPrimaryClick: () => void;
};

export function DashboardHeader({
  dateFrom,
  dateTo,
  onPeriodChange,
  overviewModule,
  onOverviewModuleChange,
  onPrimaryClick,
}: DashboardHeaderProps) {
  const meta = HEADER_META[overviewModule];

  return (
    <header className="dash-fixed-header w-full">
      <div className="dash-shell w-full pb-1.5">
        <div className="dash-header-controls-row">
          <div className="min-w-0 shrink-0">
            <h1 className="dash-header-overview-title">{meta.title}</h1>
            <p className="dash-header-overview-sub">{meta.subtitle}</p>
          </div>

          <div className="dash-header-module-center">
            <OverviewModuleFilterBar
              value={overviewModule}
              onChange={onOverviewModuleChange}
            />
          </div>

          <div className="dash-header-controls">
            <ComprasPeriodFilter
              dateFrom={dateFrom}
              dateTo={dateTo}
              onChange={onPeriodChange}
            />

            <button type="button" className="dash-btn-primary" onClick={onPrimaryClick}>
              <Plus size={16} strokeWidth={2} />
              {meta.cta}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
