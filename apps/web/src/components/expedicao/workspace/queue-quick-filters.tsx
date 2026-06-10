'use client';

import { Flame, Zap } from 'lucide-react';
import type { StatusFilterId } from '@/src/components/expedicao/shared/types';

export type QueueQuickFilterId = 'all' | 'atrasado' | 'urgente' | 'em_separacao';

export function statusFilterToQuick(status: StatusFilterId): QueueQuickFilterId {
  if (status === 'urgente') return 'urgente';
  if (status === 'atrasado') return 'atrasado';
  if (status === 'em_separacao') return 'em_separacao';
  return 'all';
}

export function quickFilterToStatus(quick: QueueQuickFilterId): StatusFilterId {
  if (quick === 'urgente') return 'urgente';
  if (quick === 'atrasado') return 'atrasado';
  if (quick === 'em_separacao') return 'em_separacao';
  return 'all';
}

export function QueueQuickFilters(props: {
  active: QueueQuickFilterId;
  onChange: (id: QueueQuickFilterId) => void;
  counts: {
    all?: number;
    atrasado?: number;
    urgente?: number;
    em_separacao?: number;
  };
}) {
  const { active, onChange, counts } = props;

  const pills: Array<{
    id: QueueQuickFilterId;
    label: string;
    icon?: typeof Flame;
    count?: number;
  }> = [
    { id: 'all', label: 'Todos', count: counts.all },
    { id: 'atrasado', label: 'Atrasados', icon: Flame, count: counts.atrasado },
    { id: 'urgente', label: 'Urgentes', icon: Zap, count: counts.urgente },
    {
      id: 'em_separacao',
      label: 'Em separação',
      count: counts.em_separacao,
    },
  ];

  return (
    <div className="exp-queue-quick-filters" role="tablist">
      {pills.map((p) => {
        const on = active === p.id;
        const Icon = p.icon;
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={on}
            className={`exp-queue-quick-pill ${on ? 'exp-queue-quick-pill--active' : ''}`}
            onClick={() => onChange(p.id)}
          >
            {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
            <span>
              {p.label}
              {p.count !== undefined ? ` [${p.count}]` : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}
