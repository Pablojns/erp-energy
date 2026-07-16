'use client';

import type { OverviewModuleFilter } from '@/src/components/dashboard/types';

const MODULES: { id: OverviewModuleFilter; label: string }[] = [
  { id: 'geral', label: 'Geral' },
  { id: 'expedicao', label: 'Expedição' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'financeiro', label: 'Financeiro' },
];

type OverviewModuleFilterProps = {
  value: OverviewModuleFilter;
  onChange: (value: OverviewModuleFilter) => void;
};

export function OverviewModuleFilterBar({ value, onChange }: OverviewModuleFilterProps) {
  return (
    <div className="dash-module-filter" role="group" aria-label="Filtrar por módulo">
      {MODULES.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`dash-module-btn ${active ? 'dash-module-btn--active' : ''}`}
            aria-pressed={active}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
