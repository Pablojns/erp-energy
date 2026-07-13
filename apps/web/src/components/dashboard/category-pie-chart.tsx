'use client';

import { PIE_COLORS, formatNumber } from '@/src/components/dashboard/utils';

type CategorySlice = { label: string; value: number };

type CategoryPieChartProps = {
  slices: CategorySlice[];
};

export function CategoryPieChart({ slices }: CategoryPieChartProps) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 88;
  let angle = -Math.PI / 2;

  const arcs = slices.map((slice, i) => {
    const frac = slice.value / total;
    const sweep = frac * Math.PI * 2;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    angle += sweep;
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    return { d, color: PIE_COLORS[i % PIE_COLORS.length], slice };
  });

  return (
    <div className="dash-card w-full p-4 md:p-6">
      <h3 className="mb-3 text-sm font-semibold text-[var(--dash-text)]">Produtos por categoria</h3>
      <div className="flex w-full flex-col items-stretch gap-4 sm:flex-row sm:items-start">
        <div className="mx-auto w-full max-w-[240px] shrink-0 overflow-visible p-2 sm:mx-0 sm:w-[38%] sm:max-w-none">
          <svg
            width="100%"
            viewBox={`0 0 ${size} ${size}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            className="block h-auto w-full overflow-visible"
            aria-label="Gráfico de pizza por categoria"
          >
          {arcs.map((a) => (
            <path key={a.slice.label} d={a.d} fill={a.color} stroke="var(--dash-card)" strokeWidth="2" />
          ))}
          </svg>
        </div>
        <ul className="flex-1 space-y-2 text-xs">
          {slices.map((s, i) => (
            <li key={s.label} className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-[var(--dash-text-muted)]">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                />
                {s.label}
              </span>
              <span className="font-semibold tabular-nums text-[var(--dash-text)]">
                {formatNumber(s.value)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function CategoryPieChartSkeleton() {
  return (
    <div className="dash-card w-full space-y-3 p-4 md:p-6">
      <div className="dash-skeleton h-4 w-44" />
      <div className="dash-skeleton mx-auto h-48 w-48 rounded-full" />
    </div>
  );
}
