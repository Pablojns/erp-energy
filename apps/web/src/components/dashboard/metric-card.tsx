import type { LucideIcon } from 'lucide-react';
import { MetallicIcon } from '@/src/components/dashboard/metallic-icon';

type MetricCardProps = {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: 'default' | 'success' | 'warning' | 'danger';
};

export function MetricCard({ label, value, icon, tone = 'default' }: MetricCardProps) {
  const toneClass =
    tone === 'danger'
      ? 'dash-metric-value--danger'
      : tone === 'warning'
        ? 'dash-metric-value--warning'
        : tone === 'success'
          ? 'dash-metric-value--success'
          : '';

  return (
    <article className="dash-card flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <MetallicIcon icon={icon} size={22} />
      </div>
      <div>
        <p className={`text-2xl font-semibold tracking-tight tabular-nums ${toneClass}`}>
          {value}
        </p>
        <p className="mt-1 text-xs font-medium text-[var(--dash-text-muted)]">{label}</p>
      </div>
    </article>
  );
}
