'use client';

import { useMemo } from 'react';
import type { MonthlyOrdersPoint } from '@/src/components/dashboard/types';
import { formatCurrency } from '@/src/components/dashboard/utils';

type MonthlyOrdersChartProps = {
  points: MonthlyOrdersPoint[];
};

export function MonthlyOrdersChart({ points }: MonthlyOrdersChartProps) {
  const layout = useMemo(() => {
    const values = points.map((p) => Number(p.value) || 0);
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    const padY = range * 0.12;
    const yMax = max + padY;
    const yMin = Math.max(0, min - padY);
    const yRange = yMax - yMin || 1;

    const width = 800;
    const height = 240;
    const margin = { top: 16, right: 16, bottom: 32, left: 8 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const coords = points.map((p, i) => {
      const x = margin.left + (i / Math.max(points.length - 1, 1)) * innerW;
      const v = Number(p.value) || 0;
      const y = margin.top + innerH - ((v - yMin) / yRange) * innerH;
      return { ...p, x, y, v };
    });

    const linePath = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
      .join(' ');

    const areaPath = `${linePath} L ${coords[coords.length - 1]?.x ?? margin.left} ${margin.top + innerH} L ${coords[0]?.x ?? margin.left} ${margin.top + innerH} Z`;

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const y = margin.top + innerH * (1 - t);
      const val = yMin + yRange * t;
      return { y, val };
    });

    return { width, height, coords, linePath, areaPath, gridLines, yMin, yRange, innerH, margin };
  }, [points]);

  return (
    <div className="dash-card w-full p-4 md:p-6">
      <div className="mb-3 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-[var(--dash-text)]">
          Valor de pedidos — últimos 12 meses
        </h3>
        <p className="text-xs text-[var(--dash-text-muted)]">Escala adaptativa automática</p>
      </div>
      <div className="dash-chart-wrap">
        <svg
          width="100%"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full"
          role="img"
          aria-label="Gráfico de valor de pedidos nos últimos 12 meses"
        >
          <defs>
            <linearGradient id="dash-line-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--dash-accent)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--dash-accent)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {layout.gridLines.map((g) => (
            <g key={g.y}>
              <line
                x1={layout.margin.left}
                y1={g.y}
                x2={layout.width - layout.margin.right}
                y2={g.y}
                stroke="var(--dash-chart-grid)"
                strokeDasharray="4 4"
              />
            </g>
          ))}

          <path d={layout.areaPath} fill="url(#dash-line-gradient)" />
          <path
            d={layout.linePath}
            fill="none"
            stroke="var(--dash-accent)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {layout.coords.map((c) => (
            <g key={c.key}>
              <circle
                cx={c.x}
                cy={c.y}
                r={c.isCurrent || c.isPrevious ? 6 : 3.5}
                fill={c.isCurrent ? 'var(--dash-accent)' : c.isPrevious ? 'var(--dash-warning)' : 'var(--dash-card)'}
                stroke="var(--dash-accent)"
                strokeWidth={c.isCurrent || c.isPrevious ? 2 : 1.5}
              />
              <text
                x={c.x}
                y={layout.height - 8}
                textAnchor="middle"
                fontSize="11"
                fill="var(--dash-text-muted)"
              >
                {c.label}
              </text>
              {(c.isCurrent || c.isPrevious) && (
                <title>{`${c.label}: ${formatCurrency(c.v)}${c.isCurrent ? ' (mês atual)' : ' (mês anterior)'}`}</title>
              )}
            </g>
          ))}
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-[var(--dash-text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--dash-accent)]" />
          Mês atual
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[var(--dash-warning)] bg-[var(--dash-card)]" />
          Mês anterior
        </span>
      </div>
    </div>
  );
}

export function MonthlyOrdersChartSkeleton() {
  return (
    <div className="dash-card w-full space-y-3 p-4 md:p-6">
      <div className="dash-skeleton h-4 w-56" />
      <div className="dash-skeleton h-[220px] w-full rounded-lg sm:h-[260px]" />
    </div>
  );
}
