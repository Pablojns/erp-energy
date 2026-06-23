'use client';

import type { DashboardFluxo } from '@/src/components/dashboard/types';
import { FLUXO_LABELS } from '@/src/components/dashboard/utils';

const FLUXO_ORDER: (keyof DashboardFluxo)[] = [
  'NOVO',
  'EM_SEPARACAO',
  'AGUARDANDO_NF',
  'FINALIZADO',
  'PARCIAL',
  'CANCELADO',
];

const BAR_COLORS = [
  '#2563eb',
  '#3b82f6',
  '#6366f1',
  '#16a34a',
  '#d97706',
  '#64748b',
];

type FlowBarChartProps = {
  fluxo: DashboardFluxo;
};

export function FlowBarChart({ fluxo }: FlowBarChartProps) {
  const data = FLUXO_ORDER.map((key, i) => ({
    key,
    label: FLUXO_LABELS[key] ?? key,
    value: fluxo[key] ?? 0,
    color: BAR_COLORS[i] ?? '#2563eb',
  }));

  const max = Math.max(...data.map((d) => d.value), 1);
  const chartW = 480;
  const chartH = 220;
  const padL = 36;
  const padR = 12;
  const padT = 12;
  const padB = 52;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;
  const barGap = 10;
  const barW = (innerW - barGap * (data.length - 1)) / data.length;

  return (
    <div className="dash-card p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-[var(--dash-text)]">Fluxo por status</h2>
      <p className="mt-0.5 text-xs text-[var(--dash-text-muted)]">Distribuição atual dos pedidos</p>

      <div className="mt-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartW} ${chartH}`}
          className="w-full min-w-[320px]"
          role="img"
          aria-label="Gráfico de barras do fluxo operacional"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = padT + innerH * (1 - t);
            const val = Math.round(max * t);
            return (
              <g key={t}>
                <line
                  x1={padL}
                  y1={y}
                  x2={chartW - padR}
                  y2={y}
                  stroke="var(--dash-chart-grid)"
                  strokeDasharray="4 4"
                />
                <text
                  x={padL - 6}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="var(--dash-text-muted)"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {data.map((d, i) => {
            const h = (d.value / max) * innerH;
            const x = padL + i * (barW + barGap);
            const y = padT + innerH - h;
            return (
              <g key={d.key}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(h, d.value > 0 ? 4 : 0)}
                  rx={4}
                  fill={d.color}
                  opacity={0.9}
                />
                <text
                  x={x + barW / 2}
                  y={chartH - padB + 14}
                  textAnchor="middle"
                  fontSize="9"
                  fill="var(--dash-text-muted)"
                >
                  {d.label.split(' ').map((w, wi) => (
                    <tspan key={wi} x={x + barW / 2} dy={wi === 0 ? 0 : 11}>
                      {w}
                    </tspan>
                  ))}
                </text>
                {d.value > 0 ? (
                  <text
                    x={x + barW / 2}
                    y={y - 4}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="600"
                    fill="var(--dash-text)"
                  >
                    {d.value}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function FlowBarChartSkeleton() {
  return (
    <div className="dash-card p-5 space-y-4">
      <div className="dash-skeleton h-4 w-40" />
      <div className="dash-skeleton h-3 w-56" />
      <div className="dash-skeleton h-52 w-full" />
    </div>
  );
}
