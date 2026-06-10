import { GlassCard } from '@/src/components/shell/glass-card';

type OperationalWidgetProps = {
  title: string;
  value: string;
  accent?: 'blue' | 'amber' | 'green';
};

const ACCENT_CLASS: Record<NonNullable<OperationalWidgetProps['accent']>, string> = {
  blue: 'from-sky-500/30 via-sky-500/5 to-transparent text-sky-100',
  amber: 'from-amber-500/30 via-amber-500/5 to-transparent text-amber-100',
  green: 'from-emerald-500/30 via-emerald-500/5 to-transparent text-emerald-100',
};

export function OperationalWidget({
  title,
  value,
  accent = 'blue',
}: OperationalWidgetProps) {
  return (
    <GlassCard
      hover
      className={`bg-gradient-to-br ${ACCENT_CLASS[accent]} p-4 ring-1 ring-white/[0.06]`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
        {title}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{value}</p>
    </GlassCard>
  );
}
