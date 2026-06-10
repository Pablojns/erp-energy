'use client';

import type { LucideIcon } from 'lucide-react';
import { KPI_DEFS } from '@/src/components/expedicao/shared/constants';
import type { ExpeditionKpiStrip } from '@/src/components/expedicao/shared/types';

export function ExpeditionKpis(props: {
  strip: ExpeditionKpiStrip | null;
  loading?: boolean;
}) {
  const { strip, loading } = props;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      {KPI_DEFS.map((c) => {
        const Icon = c.icon as LucideIcon;
        const value = strip
          ? strip[c.key as keyof ExpeditionKpiStrip]
          : 0;
        return (
          <div
            key={c.key}
            className="erp-kpi-card erp-kpi-card--rich group"
            data-ring={c.ring}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="erp-kpi-label">{c.label}</p>
              <span className="erp-kpi-icon flex h-8 w-8 items-center justify-center rounded-lg">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p
              className={`erp-kpi-value ${loading ? 'animate-pulse text-erp-fg-subtle' : ''}`}
            >
              {loading ? '—' : Number(value).toLocaleString('pt-BR')}
            </p>
          </div>
        );
      })}
    </div>
  );
}
