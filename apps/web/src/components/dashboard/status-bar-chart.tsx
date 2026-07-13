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
  const margin = { top: 28, right: 16, bottom: 52, left: 16 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const slotW = innerW / items.length;
  const barW = Math.max(24, slotW - 16);
  const baselineY = margin.top + innerH;

  return (
    <div className="dash-card w-full p-4 md:p-6">
      <h3 className="mb-3 text-sm font-semibold text-[var(--dash-text)]">Pedidos por status</h3>
      <div className="dash-chart-wrap">
        <svg
          width="100%"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full"
          role="img"
          aria-label="Gráfico de barras por status de pedido"
        >
          <line
            x1={margin.left}
            y1={baselineY}
            x2={width - margin.right}
            y2={baselineY}
            stroke="var(--dash-border)"
            strokeWidth="1"
          />

          {items.map((item, i) => {
            const rawH = item.value === 0 ? 0 : (item.value / max) * innerH;
            const h = item.value === 0 ? 0 : Math.max(6, rawH);
            const x = margin.left + i * slotW + (slotW - barW) / 2;
            const y = baselineY - h;
            const centerX = x + barW / 2;
            const valueY =
              item.value === 0
                ? baselineY - 10
                : Math.max(margin.top + 12, y - 8);

            return (
              <g key={item.key}>
                {item.value > 0 ? (
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={h}
                    rx={4}
                    fill={FLUXO_COLORS[item.key] ?? '#64748b'}
                    opacity={0.92}
                  />
                ) : (
                  <line
                    x1={x + 4}
                    y1={baselineY - 1}
                    x2={x + barW - 4}
                    y2={baselineY - 1}
                    stroke={FLUXO_COLORS[item.key] ?? '#64748b'}
                    strokeWidth="2"
                    strokeLinecap="round"
                    opacity={0.45}
                  />
                )}
                <text
                  x={centerX}
                  y={valueY}
                  textAnchor="middle"
                  fontSize="11"
                  fill="var(--dash-text)"
                  fontWeight="600"
                >
                  {formatNumber(item.value)}
                </text>
                <text
                  x={centerX}
                  y={baselineY + 16}
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
