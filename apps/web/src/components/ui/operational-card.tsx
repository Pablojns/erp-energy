import { StatusBadge } from './status-badge';
import { GlassCard } from '@/src/components/shell/glass-card';

type OperationalCardProps = {
  label: string;
  value: string;
  delta?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
  helper?: string;
};

export function OperationalCard({
  label,
  value,
  delta,
  tone = 'neutral',
  helper,
}: OperationalCardProps) {
  return (
    <GlassCard
      hover
      className="border border-[var(--border-color)] bg-[var(--bg-card)] p-3 shadow-sm transition duration-300 hover:-translate-y-0.5 sm:p-5"
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-[var(--text-secondary)]">{label}</p>
        {delta ? <StatusBadge label={delta} tone={tone} /> : null}
      </div>
      <p className="mt-3 text-lg font-bold tracking-tight text-[var(--text-primary)] tabular-nums sm:text-2xl">
        {value}
      </p>
      {helper ? <p className="mt-2 text-xs text-[var(--text-muted)]">{helper}</p> : null}
    </GlassCard>
  );
}
