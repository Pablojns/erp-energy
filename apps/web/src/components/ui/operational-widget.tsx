import { GlassCard } from '@/src/components/shell/glass-card';

type OperationalWidgetProps = {
  title: string;
  value: string;
  accent?: 'blue' | 'amber' | 'green';
};

const ACCENT_CLASS: Record<NonNullable<OperationalWidgetProps['accent']>, string> = {
  blue: 'from-sky-100 via-sky-50 to-transparent text-sky-800',
  amber: 'from-amber-100 via-amber-50 to-transparent text-amber-800',
  green: 'from-emerald-100 via-emerald-50 to-transparent text-emerald-800',
};

export function OperationalWidget({
  title,
  value,
  accent = 'blue',
}: OperationalWidgetProps) {
  return (
    <GlassCard
      hover
      className={`bg-gradient-to-br ${ACCENT_CLASS[accent]} p-4 ring-1 ring-gray-200`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
        {title}
      </p>
      <p className="mt-2 text-lg font-semibold tabular-nums text-gray-900 sm:text-2xl">{value}</p>
    </GlassCard>
  );
}
