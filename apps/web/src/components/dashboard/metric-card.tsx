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
    <article className="dash-card dash-metric-card flex h-20 max-h-20 w-full flex-col justify-center gap-0.5 p-3 md:h-auto md:max-h-none md:gap-2 md:p-6">
      {Icon ? (
        <Icon
          size={14}
          strokeWidth={1.75}
          className="hidden text-[var(--dash-accent)] md:block md:h-[18px] md:w-[18px]"
        />
      ) : null}
      <div>
        <p className={`text-xl font-semibold tracking-tight tabular-nums md:text-2xl ${toneClass}`}>
          {value}
        </p>
        <p className="mt-0.5 text-[11px] font-medium text-[var(--dash-text-muted)] md:mt-1 md:text-xs">
          {label}
        </p>
      </div>
    </article>
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="dash-card h-20 max-h-20 w-full space-y-2 p-3 md:h-auto md:max-h-none md:space-y-3 md:p-6">
      <div className="dash-skeleton hidden h-5 w-5 rounded-full md:block" />
      <div className="dash-skeleton h-6 w-2/3 md:h-8" />
      <div className="dash-skeleton h-3 w-1/2" />
    </div>
  );
}
