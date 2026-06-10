'use client';

import { STATUS_FILTERS } from '@/src/components/expedicao/shared/constants';
import type { StatusFilterId } from '@/src/components/expedicao/shared/types';

const TONE_CLASS: Record<string, string> = {
  slate: 'exp-wb-chip--slate',
  sky: 'exp-wb-chip--sky',
  rose: 'exp-wb-chip--rose',
  orange: 'exp-wb-chip--orange',
  amber: 'exp-wb-chip--amber',
  violet: 'exp-wb-chip--violet',
  indigo: 'exp-wb-chip--indigo',
  emerald: 'exp-wb-chip--emerald',
};

export function countExpeditionUiFilters(
  statusFilter: StatusFilterId,
  search: string,
): number {
  let n = 0;
  if (statusFilter !== 'all') n += 1;
  if (search.trim()) n += 1;
  return n;
}

/** Painel compacto de filtros avançados (dropdown). */
export function OrderStatusFilters(props: {
  active: StatusFilterId;
  onChange: (id: StatusFilterId) => void;
  counts?: Partial<Record<StatusFilterId, number>>;
}) {
  const { active, onChange, counts = {} } = props;

  return (
    <div className="exp-queue-advanced-filters" role="listbox">
      {STATUS_FILTERS.map((f) => {
        const Icon = f.icon;
        const on = active === f.id;
        const count = counts[f.id];

        return (
          <button
            key={f.id}
            type="button"
            role="option"
            aria-selected={on}
            title={f.hint}
            onClick={() => onChange(f.id)}
            className={`exp-wb-chip ${TONE_CLASS[f.tone]} ${on ? 'exp-wb-chip--active' : ''}`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{f.label}</span>
            {count !== undefined && count > 0 ? (
              <span className="exp-wb-chip-count">{count > 99 ? '99+' : count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
