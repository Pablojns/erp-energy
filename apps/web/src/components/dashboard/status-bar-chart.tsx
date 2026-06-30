'use client';

import type { DashboardFluxo } from '@/src/components/dashboard/types';
import { FLUXO_COLORS, FLUXO_LABELS, formatNumber } from '@/src/components/dashboard/utils';

type StatusBarChartProps = {
  fluxo: DashboardFluxo;
};

const ORDER: (keyof DashboardFluxo)[] = [
  'NOVO',
  'EM_SEPARACAO',
  'AGUARDANDO_NF',
  'FINALIZADO',
  'PARCIAL',
  'CANCELADO',
];

export function StatusBarChart({ fluxo }: StatusBarChartProps) {
  const items = ORDER.map((k) => ({ key: k, value: Number(fluxo[k]) || 0 }));
  const max = Math.max(...items.map((i) => i.value), 1);
  const width = 800;
  const height = 260;
  const margin = { top: 16, right: 16, bottom: 48, left: 16 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const barW = innerW / items.length - 12;

  return (
    <div className="dash-card w-full p-4 md:p-6">
      <h3 className="mb-3 text-sm font-semibold text-[var(--dash-text)]">Pedidos por status</h3>
      <div className="dash-chart-wrap">
        <svg
          width="100%"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full"
          role="img">
          {items.map((item, i) => {
            const h = (item.value / max) * innerH;
            const x = margin.left + i * (barW + 12);
            const y = margin.top + innerH - h;
            return (
              <g key={item.key}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  rx={4}
                  fill={FLUXO_COLORS[item.key] ?? '#64748b'}
                  opacity={0.9}
                />
                <text
                  x={x + barW / 2}
                  y={y - 6}
                  textAnchor="middle"
                  fontSize="11"
                  fill="var(--dash-text)"
                  fontWeight="600"
                >
                  {formatNumber(item.value)}
                </text>
                <text
                  x={x + barW / 2}
                  y={margin.top + innerH + 18}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--dash-text-muted)"
                >
                  {FLUXO_LABELS[item.key]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function StatusBarChartSkeleton() {
  return (
    <div className="dash-card w-full p-4 md:p-6">
      <div className="dash-skeleton mb-3 h-4 w-40" />
      <div className="dash-skeleton h-[220px] w-full rounded-lg" />
    </div>
  );
}
