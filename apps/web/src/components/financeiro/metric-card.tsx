export function FinanceiroMetricCard(props: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'danger' | 'warning';
}) {
  const { label, value, tone = 'default' } = props;
  const valueClass =
    tone === 'danger'
      ? 'text-red-400'
      : tone === 'success'
        ? 'text-emerald-400'
        : tone === 'warning'
          ? 'text-amber-400'
          : 'text-zinc-100';

  return (
    <article className="rounded-xl border border-white/10 bg-[#0d1320] p-4">
      <p className={`text-xl font-semibold tabular-nums sm:text-2xl ${valueClass}`}>
        {value}
      </p>
      <p className="mt-1 text-xs font-medium text-zinc-500">{label}</p>
    </article>
  );
}

export function FinanceiroMetricCardSkeleton() {
  return (
    <article className="animate-pulse rounded-xl border border-white/10 bg-[#0d1320] p-4">
      <div className="h-7 w-28 rounded bg-white/10 sm:h-8" />
      <div className="mt-2 h-3 w-24 rounded bg-white/5" />
    </article>
  );
}
