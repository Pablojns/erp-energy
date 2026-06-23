'use client';

import type { DashboardRankingItem } from '@/src/components/dashboard/types';
import { formatNumber } from '@/src/components/dashboard/utils';

const SLICE_COLORS = ['#2563eb', '#3b82f6', '#6366f1', '#16a34a', '#d97706'];

type CarriersPieChartProps = {
  items: DashboardRankingItem[];
};

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

export function CarriersPieChart({ items }: CarriersPieChartProps) {
  const data = items.slice(0, 5);
  const total = data.reduce((acc, item) => acc + item.total, 0);
  const cx = 120;
  const cy = 120;
  const r = 88;

  let cursor = 0;
  const slices = data.map((item, i) => {
    const angle = total > 0 ? (item.total / total) * 360 : 0;
    const start = cursor;
    const end = cursor + angle;
    cursor = end;
    return {
      ...item,
      path: angle > 0 ? describeArc(cx, cy, r, start, end) : '',
      color: SLICE_COLORS[i % SLICE_COLORS.length],
      pct: total > 0 ? (item.total / total) * 100 : 0,
    };
  });

  return (
    <div className="dash-card p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-[var(--dash-text)]">Top transportadoras</h2>
      <p className="mt-0.5 text-xs text-[var(--dash-text-muted)]">Participação no período</p>

      {data.length === 0 ? (
        <p className="mt-8 text-center text-sm text-[var(--dash-text-muted)]">
          Sem saídas no período selecionado.
        </p>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-center">
          <svg viewBox="0 0 240 240" className="h-52 w-52 shrink-0" role="img" aria-label="Gráfico de pizza das transportadoras">
            {slices.map((s, i) =>
              s.path ? (
                <path key={i} d={s.path} fill={s.color} stroke="var(--dash-card)" strokeWidth="2" />
              ) : null,
            )}
            <circle cx={cx} cy={cy} r={42} fill="var(--dash-card)" />
            <text
              x={cx}
              y={cy - 4}
              textAnchor="middle"
              fontSize="18"
              fontWeight="600"
              fill="var(--dash-text)"
            >
              {formatNumber(total)}
            </text>
            <text
              x={cx}
              y={cy + 14}
              textAnchor="middle"
              fontSize="10"
              fill="var(--dash-text-muted)"
            >
              saídas
            </text>
          </svg>

          <ul className="w-full min-w-0 space-y-2 sm:max-w-[200px]">
            {slices.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: s.color }}
                />
                <span className="min-w-0 flex-1 truncate text-[var(--dash-text)]" title={s.nome}>
                  {s.nome}
                </span>
                <span className="shrink-0 tabular-nums text-[var(--dash-text-muted)]">
                  {s.pct.toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function CarriersPieChartSkeleton() {
  return (
    <div className="dash-card p-5 space-y-4">
      <div className="dash-skeleton h-4 w-44" />
      <div className="dash-skeleton h-3 w-52" />
      <div className="mx-auto dash-skeleton h-52 w-52 rounded-full" />
    </div>
  );
}
