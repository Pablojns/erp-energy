import Link from 'next/link';
import { AlertTriangle, Clock, FileWarning, Zap } from 'lucide-react';
import { MetallicIcon } from '@/src/components/dashboard/metallic-icon';
import type { DashboardResumo } from '@/src/components/dashboard/types';
import { formatNumber } from '@/src/components/dashboard/utils';

type AlertsPanelProps = {
  alertas: DashboardResumo['alertas'];
};

const ALERT_ITEMS = [
  {
    key: 'pedidosUrgentes' as const,
    label: 'Pedidos urgentes',
    icon: Zap,
    href: '/app/expedicao/pedidos',
    tone: 'warning' as const,
  },
  {
    key: 'pedidosAtrasados' as const,
    label: 'Pedidos atrasados',
    icon: Clock,
    href: '/app/expedicao/pedidos',
    tone: 'danger' as const,
  },
  {
    key: 'pedidosSemNF' as const,
    label: 'Pedidos sem NF',
    icon: FileWarning,
    href: '/app/expedicao/pedidos',
    tone: 'warning' as const,
  },
];

export function AlertsPanel({ alertas }: AlertsPanelProps) {
  return (
    <div className="dash-card p-4 sm:p-5 h-full">
      <div className="flex items-center gap-2">
        <MetallicIcon icon={AlertTriangle} size={18} />
        <h2 className="text-sm font-semibold text-[var(--dash-text)]">Alertas</h2>
      </div>
      <p className="mt-0.5 text-xs text-[var(--dash-text-muted)]">Clique para ir à expedição</p>

      <ul className="mt-4 space-y-2">
        {ALERT_ITEMS.map((item) => {
          const count = alertas[item.key];
          const Icon = item.icon;
          const countClass =
            item.tone === 'danger' && count > 0
              ? 'text-[var(--dash-danger)]'
              : item.tone === 'warning' && count > 0
                ? 'text-[var(--dash-warning)]'
                : 'text-[var(--dash-text)]';

          return (
            <li key={item.key}>
              <Link href={item.href} className="dash-alert-link">
                <Icon
                  size={18}
                  strokeWidth={1.75}
                  className={
                    count > 0 && item.tone === 'danger'
                      ? 'text-[var(--dash-danger)] shrink-0'
                      : count > 0
                        ? 'text-[var(--dash-warning)] shrink-0'
                        : 'text-[var(--dash-text-muted)] shrink-0'
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--dash-text)]">{item.label}</p>
                  <p className={`text-lg font-semibold tabular-nums ${countClass}`}>
                    {formatNumber(count)}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AlertsPanelSkeleton() {
  return (
    <div className="dash-card p-5 space-y-4 h-full">
      <div className="dash-skeleton h-4 w-24" />
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="dash-skeleton h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
