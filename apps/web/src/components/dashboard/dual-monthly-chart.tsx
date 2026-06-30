'use client';

import { useMemo } from 'react';
import type { MonthlyOrdersPoint } from '@/src/components/dashboard/types';
import { formatCurrency } from '@/src/components/dashboard/utils';

type DualMonthlyChartProps = {
  points: MonthlyOrdersPoint[];
  title?: string;
  subtitle?: string;
};

export function DualMonthlyChart({
  points,
  title = 'Pedidos vs Faturado — últimos 12 meses',
  subtitle = 'Duas séries com escala automática',
}: DualMonthlyChartProps) {
  const layout = useMemo(() => {
    const pedidos = points.map((p) => Number(p.value) || 0);
    const faturado = points.map((p) => Number(p.faturado) || 0);
    const all = [...pedidos, ...faturado];
    const max = Math.max(...all, 1);
    const yMax = max * 1.12;
    const width = 800;
    const height = 260;
    const margin = { top: 20, right: 16, bottom: 32, left: 8 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const mapSeries = (vals: number[]) =>
      vals.map((v, i) => {
        const x = margin.left + (i / Math.max(points.length - 1, 1)) * innerW;
        const y = margin.top + innerH - (v / yMax) * innerH;
        return { x, y, v };
      });

    const pedCoords = mapSeries(pedidos);
    const fatCoords = mapSeries(faturado);

    const path = (coords: { x: number; y: number }[]) =>
      coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(' ');

    const area = (line: string, coords: { x: number; y: number }[]) =>
      `${line} L ${coords[coords.length - 1]?.x ?? margin.left} ${margin.top + innerH} L ${coords[0]?.x ?? margin.left} ${margin.top + innerH} Z`;

    return {
      width,
      height,
      margin,
      innerH,
      pedCoords,
      fatCoords,
      pedPath: path(pedCoords),
      fatPath: path(fatCoords),
      pedArea: area(path(pedCoords), pedCoords),
      points,
    };
  }, [points]);

  return (
    <div className="dash-card w-full p-4 md:p-6">
      <div className="mb-3 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-[var(--dash-text)]">{title}</h3>
        <p className="text-xs text-[var(--dash-text-muted)]">{subtitle}</p>
      </div>
      <div className="dash-chart-wrap">
        <svg
          width="100%"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full"
          role="img">
          <defs>
            <linearGradient id="dash-ped-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--dash-accent)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--dash-accent)" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="dash-fat-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--dash-success)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--dash-success)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={layout.pedArea} fill="url(#dash-ped-gradient)" />
          <path d={layout.fatPath} fill="none" stroke="var(--dash-success)" strokeWidth="2" strokeDasharray="6 4" />
          <path d={layout.pedPath} fill="none" stroke="var(--dash-accent)" strokeWidth="2.5" />
          {layout.pedCoords.map((c, i) => {
            const p = layout.points[i];
            if (!p?.isCurrent && !p?.isPrevious) return null;
            return (
              <circle
                key={p.key}
                cx={c.x}
                cy={c.y}
                r={5}
                fill={p.isCurrent ? 'var(--dash-accent)' : 'var(--dash-warning)'}
                stroke="var(--dash-card)"
                strokeWidth="2"
              />
            );
          })}
          {layout.points.map((p, i) => (
            <text
              key={`lbl-${p.key}`}
              x={layout.pedCoords[i]?.x ?? 0}
              y={layout.height - 8}
              textAnchor="middle"
              fontSize="11"
              fill="var(--dash-text-muted)"
            >
              {p.label}
            </text>
          ))}
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-[var(--dash-text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-[var(--dash-accent)]" />
          Valor pedidos ({formatCurrency(layout.pedCoords.at(-1)?.v ?? 0)} mês atual)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-[var(--dash-success)]" />
          Valor faturado
        </span>
      </div>
    </div>
  );
}

export function DualMonthlyChartSkeleton() {
  return (
    <div className="dash-card w-full space-y-3 p-4 md:p-6">
      <div className="dash-skeleton h-4 w-56" />
      <div className="dash-skeleton h-[220px] w-full rounded-lg sm:h-[280px]" />
    </div>
  );
}
