import type { LucideIcon } from 'lucide-react';

type MetricCardProps = {
  label: string;
  value: string;
  icon?: LucideIcon;
  tone?: 'default' | 'success' | 'warning' | 'danger';
};

export function MetricCard({ label, value, icon: Icon, tone = 'default' }: MetricCardProps) {
  const toneClass =
    tone === 'danger'
      ? 'dash-metric-value--danger'
      : tone === 'warning'
        ? 'dash-metric-value--warning'
        : tone === 'success'
          ? 'dash-metric-value--success'
          : '';

  return (
    <article className="dash-card flex w-full flex-col gap-2 p-4 md:p-6">
      {Icon ? (
        <Icon size={18} strokeWidth={1.75} className="text-[var(--dash-accent)]" />
      ) : null}
      <div>
        <p className={`text-xl font-semibold tracking-tight tabular-nums sm:text-2xl ${toneClass}`}>
          {value}
        </p>
        <p className="mt-1 text-xs font-medium text-[var(--dash-text-muted)]">{label}</p>
      </div>
    </article>
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="dash-card w-full space-y-3 p-4 md:p-6">
      <div className="dash-skeleton h-5 w-5 rounded-full" />
      <div className="dash-skeleton h-8 w-2/3" />
      <div className="dash-skeleton h-3 w-1/2" />
    </div>
  );
}
