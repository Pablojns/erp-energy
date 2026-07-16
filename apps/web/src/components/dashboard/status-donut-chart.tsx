'use client';

import { FLUXO_COLORS, FLUXO_LABELS, formatNumber } from '@/src/components/dashboard/utils';
import type { DashboardFluxo } from '@/src/components/dashboard/types';

const ORDER: (keyof DashboardFluxo)[] = [
  'FINALIZADO',
  'NOVO',
  'PARCIAL',
  'EM_SEPARACAO',
  'AGUARDANDO_NF',
  'CANCELADO',
];

type StatusDonutChartProps = {
  fluxo: DashboardFluxo;
  title?: string;
};

export function StatusDonutChart({
  fluxo,
  title = 'Status dos Pedidos',
}: StatusDonutChartProps) {
  const slices = ORDER.map((key) => ({
    key,
    label: FLUXO_LABELS[key] ?? key,
    value: Number(fluxo[key]) || 0,
    color: FLUXO_COLORS[key] ?? '#64748b',
  })).filter((s) => s.value > 0);

  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 88;
  const ri = 62;
  let angle = -Math.PI / 2;

  const arcs =
    total > 0
      ? slices.map((slice) => {
          const frac = slice.value / total;
          const sweep = frac * Math.PI * 2;
          const x1 = cx + r * Math.cos(angle);
          const y1 = cy + r * Math.sin(angle);
          const x2 = cx + r * Math.cos(angle + sweep);
          const y2 = cy + r * Math.sin(angle + sweep);
          const xi1 = cx + ri * Math.cos(angle + sweep);
          const yi1 = cy + ri * Math.sin(angle + sweep);
          const xi2 = cx + ri * Math.cos(angle);
          const yi2 = cy + ri * Math.sin(angle);
          const large = sweep > Math.PI ? 1 : 0;
          const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi1} ${yi1} A ${ri} ${ri} 0 ${large} 0 ${xi2} ${yi2} Z`;
          angle += sweep;
          return { d, slice };
        })
      : [];

  return (
    <article className="exec-card exec-card--fill flex min-h-0 flex-col p-2.5 md:p-3">
      <h3 className="exec-card-title shrink-0">{title}</h3>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden sm:flex-row sm:items-center sm:gap-4">
        <div className="relative mx-auto aspect-square w-[min(100%,12rem)] shrink-0 lg:w-[min(100%,14rem)]">
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="h-full w-full"
            role="img"
            aria-label="Gráfico de status dos pedidos"
          >
            {total === 0 ? (
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="var(--dash-border)"
                strokeWidth={r - ri}
              />
            ) : (
              arcs.map((a) => (
                <path key={a.slice.key} d={a.d} fill={a.slice.color} stroke="#fff" strokeWidth="1" />
              ))
            )}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-base font-bold tabular-nums text-[var(--dash-text)] md:text-lg">
              {formatNumber(total)}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--dash-text-muted)]">
              Total
            </span>
          </div>
        </div>
        <ul className="min-w-0 w-full flex-1 space-y-1.5 overflow-auto text-sm sm:w-auto">
          {ORDER.map((key) => {
            const value = Number(fluxo[key]) || 0;
            if (value === 0 && total > 0) return null;
            return (
              <li key={key} className="flex items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-2 text-[var(--dash-text-muted)]">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: FLUXO_COLORS[key] }}
                  />
                  <span className="truncate">{FLUXO_LABELS[key]}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--dash-text)]">
                  {formatNumber(value)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}

export function StatusDonutChartSkeleton() {
  return (
    <article className="exec-card exec-card--fill p-3 md:p-4">
      <div className="dash-skeleton mb-3 h-4 w-36" />
      <div className="flex items-center gap-4">
        <div className="dash-skeleton h-32 w-32 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="dash-skeleton h-3 w-full" />
          ))}
        </div>
      </div>
    </article>
  );
}
