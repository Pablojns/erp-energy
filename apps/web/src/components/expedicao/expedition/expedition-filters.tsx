'use client';

import type { StatusFilterDef } from '@/src/components/expedicao/shared/constants';
import { STATUS_FILTERS } from '@/src/components/expedicao/shared/constants';
import type { StatusFilterId } from '@/src/components/expedicao/shared/types';

const TONE_RING: Record<StatusFilterDef['tone'], string> = {
  sky: 'erp-status-pill--sky',
  rose: 'erp-status-pill--rose',
  amber: 'erp-status-pill--amber',
  orange: 'erp-status-pill--orange',
  violet: 'erp-status-pill--violet',
  emerald: 'erp-status-pill--emerald',
  slate: 'erp-status-pill--slate',
  indigo: 'erp-status-pill--indigo',
};

export function ExpeditionFilters(props: {
  active: StatusFilterId;
  onChange: (id: StatusFilterId) => void;
  counts?: Partial<Record<StatusFilterId, number>>;
  hint?: string;
}) {
  const { active, onChange, counts = {}, hint } = props;
  const activeDef = STATUS_FILTERS.find((f) => f.id === active);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-erp-fg-muted">
          Status do pedido
        </p>
      </div>
      <div className="erp-scrollbar flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((f) => {
          const on = f.id === active;
          const Icon = f.icon;
          const count = counts[f.id];
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onChange(f.id)}
              className={`erp-status-pill shrink-0 ${TONE_RING[f.tone]} ${on ? 'erp-status-pill--active' : ''}`}
              data-active={on ? 'true' : 'false'}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
              <span>{f.label}</span>
              {count !== undefined && count > 0 ? (
                <span className="erp-status-pill-count font-mono tabular-nums">
                  {count > 99 ? '99+' : count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="text-[13px] leading-relaxed text-erp-fg-muted">
        {hint ?? activeDef?.hint ?? 'Selecione um status operacional.'}
      </p>
    </div>
  );
}
