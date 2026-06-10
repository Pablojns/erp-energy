'use client';

import { AlertTriangle, CheckCircle2, Truck } from 'lucide-react';
import { GlassCard } from '@/src/components/shell/glass-card';

type Activity = {
  id: string;
  icon: 'check' | 'truck' | 'alert';
  message: string;
  time: string;
};

const ICONS = {
  check: CheckCircle2,
  truck: Truck,
  alert: AlertTriangle,
};

const COLOR = {
  check: 'text-emerald-400/90',
  truck: 'text-sky-400/90',
  alert: 'text-amber-400/90',
};

type ActivityFeedProps = {
  items?: Activity[];
};

const DEFAULT_ITEMS: Activity[] = [
  {
    id: '1',
    icon: 'check',
    message: 'Pedido #45173654 separado com sucesso',
    time: '2 min atrás',
  },
  {
    id: '2',
    icon: 'truck',
    message: 'Romaneio SP Capital despachado — transportadora Log Sul',
    time: '14 min atrás',
  },
  {
    id: '3',
    icon: 'alert',
    message: 'Estoque crítico SKU MED-884 — corredor B-07',
    time: '28 min atrás',
  },
];

export function ActivityFeed({ items = DEFAULT_ITEMS }: ActivityFeedProps) {
  return (
    <GlassCard className="p-5">
      <h3 className="text-sm font-semibold text-[var(--text-title)]">Atividades recentes</h3>
      <ul className="mt-4 space-y-3">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          return (
            <li
              key={item.id}
              className="flex gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3 transition hover:bg-[var(--bg-card-hover)]"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] ${COLOR[item.icon]}`}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-[var(--text-primary)]">{item.message}</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{item.time}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}
