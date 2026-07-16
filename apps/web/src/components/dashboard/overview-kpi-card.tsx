'use client';

type OverviewKpiCardProps = {
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
  deltaLabel?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  sparkline?: number[];
};

function toneClass(tone: OverviewKpiCardProps['tone']) {
  if (tone === 'danger') return 'exec-kpi-value--danger';
  if (tone === 'warning') return 'exec-kpi-value--warning';
  if (tone === 'success') return 'exec-kpi-value--success';
  return '';
}

function Sparkline({ values }: { values: number[] }) {
  const series = values.length >= 2 ? values : [0, 0];
  const w = 72;
  const h = 28;
  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const span = max - min || 1;
  const points = series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="exec-kpi-sparkline" aria-hidden>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export function OverviewKpiCard({
  label,
  value,
  hint,
  delta,
  deltaLabel,
  tone = 'default',
  sparkline,
}: OverviewKpiCardProps) {
  const deltaTone =
    delta == null || delta === 0
      ? 'flat'
      : delta > 0
        ? 'up'
        : 'down';

  return (
    <article className="exec-kpi-card">
      <div className="exec-kpi-card-top">
        <p className="exec-kpi-label">{label}</p>
        <div className="exec-kpi-sparkline-slot">
          <Sparkline values={sparkline ?? []} />
        </div>
      </div>
      <p className={`exec-kpi-value ${toneClass(tone)}`}>{value}</p>
      <div className="exec-kpi-footer">
        {hint ? <p className="exec-kpi-hint">{hint}</p> : null}
        {delta != null ? (
          <p className={`exec-kpi-delta exec-kpi-delta--${deltaTone}`}>
            {delta > 0 ? '+' : ''}
            {delta.toFixed(1)}% {deltaLabel ?? 'vs mês anterior'}
          </p>
        ) : (
          <p className="exec-kpi-delta exec-kpi-delta--placeholder" aria-hidden>
            &nbsp;
          </p>
        )}
      </div>
    </article>
  );
}

export function OverviewKpiCardSkeleton() {
  return (
    <article className="exec-kpi-card">
      <div className="dash-skeleton mb-2 h-3 w-20" />
      <div className="dash-skeleton mb-1 h-7 w-16" />
      <div className="dash-skeleton h-3 w-24" />
    </article>
  );
}
