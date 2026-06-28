import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function FinMetricCard(props: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'success' | 'danger' | 'warning';
  icon?: LucideIcon;
  extra?: ReactNode;
  large?: boolean;
}) {
  const { label, value, hint, tone = 'default', icon: Icon, extra, large } = props;

  const valueColor =
    tone === 'danger'
      ? 'text-[var(--fin-danger)]'
      : tone === 'success'
        ? 'text-[var(--fin-success)]'
        : tone === 'warning'
          ? 'text-[var(--fin-warning)]'
          : 'text-[var(--fin-text)]';

  return (
    <article className="fin-card group relative overflow-hidden rounded-2xl p-4 transition hover:border-[var(--fin-border-strong)] sm:p-5">
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.07]"
        style={{ background: 'var(--fin-accent)' }}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--fin-text-muted)]">
          {label}
        </p>
        {Icon ? (
          <Icon className="h-4 w-4 shrink-0 text-[var(--fin-text-muted)]" aria-hidden />
        ) : null}
      </div>
      <p
        className={`mt-2 font-bold tabular-nums tracking-tight ${valueColor} ${
          large ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'
        }`}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1.5 text-xs text-[var(--fin-text-secondary)]">{hint}</p>
      ) : null}
      {extra ? <div className="mt-3">{extra}</div> : null}
    </article>
  );
}

export function FinHealthCard(props: {
  grade: string;
  label: string;
  tone: 'success' | 'warning' | 'danger';
}) {
  const { grade, label, tone } = props;
  const ring =
    tone === 'success'
      ? 'var(--fin-success)'
      : tone === 'warning'
        ? 'var(--fin-warning)'
        : 'var(--fin-danger)';

  return (
    <article className="fin-card flex flex-col items-center justify-center rounded-2xl p-4 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--fin-text-muted)]">
        Saúde financeira
      </p>
      <div
        className="relative mt-4 flex h-28 w-28 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(${ring} ${tone === 'success' ? 88 : tone === 'warning' ? 62 : 35}%, var(--fin-card-muted) 0)`,
        }}
      >
        <div
          className="flex h-[4.5rem] w-[4.5rem] flex-col items-center justify-center rounded-full"
          style={{ background: 'var(--fin-card)' }}
        >
          <span className="text-2xl font-bold" style={{ color: ring }}>
            {grade}
          </span>
        </div>
      </div>
      <p className="mt-3 text-sm font-semibold" style={{ color: ring }}>
        {label}
      </p>
    </article>
  );
}
