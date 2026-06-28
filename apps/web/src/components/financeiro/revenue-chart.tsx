'use client';

import type { RevenueChartPoint } from '@/src/components/financeiro/types';

export function RevenueChart(props: {
  points: RevenueChartPoint[];
  loading?: boolean;
}) {
  const { points, loading } = props;

  const width = 640;
  const height = 220;
  const pad = { top: 16, right: 16, bottom: 32, left: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const maxVal = Math.max(
    1,
    ...points.flatMap((p) => [p.faturado, p.recebido]),
  );

  const xStep = points.length > 1 ? plotW / (points.length - 1) : plotW;

  const toY = (v: number) => pad.top + plotH - (v / maxVal) * plotH;
  const toX = (i: number) => pad.left + i * xStep;

  const linePath = (key: 'faturado' | 'recebido') =>
    points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(p[key])}`)
      .join(' ');

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => pad.top + plotH * (1 - f));

  if (loading) return null;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-[320px] w-full"
        role="img"
        aria-label="Gráfico faturado versus recebido"
      >
        {gridLines.map((y, i) => (
          <line
            key={i}
            x1={pad.left}
            y1={y}
            x2={width - pad.right}
            y2={y}
            stroke="var(--fin-chart-grid)"
            strokeWidth="1"
          />
        ))}
        <line
          x1={pad.left}
          y1={pad.top + plotH}
          x2={width - pad.right}
          y2={pad.top + plotH}
          stroke="var(--fin-border)"
        />
        {points.length > 0 ? (
          <>
            <path
              d={linePath('faturado')}
              fill="none"
              stroke="var(--fin-chart-faturado)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={linePath('recebido')}
              fill="none"
              stroke="var(--fin-chart-recebido)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="6 4"
            />
            {points.map((p, i) =>
              i % Math.max(1, Math.ceil(points.length / 8)) === 0 || i === points.length - 1 ? (
                <text
                  key={p.label}
                  x={toX(i)}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-[var(--fin-text-muted)] text-[10px]"
                >
                  {p.label}
                </text>
              ) : null,
            )}
          </>
        ) : (
          <text
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            className="fill-[var(--fin-text-muted)] text-sm"
          >
            Sem dados no período
          </text>
        )}
      </svg>
      <div className="mt-3 flex flex-wrap justify-center gap-4 text-xs text-[var(--fin-text-secondary)]">
        <span className="inline-flex items-center gap-2">
          <span
            className="h-0.5 w-5 rounded-full"
            style={{ background: 'var(--fin-chart-faturado)' }}
          />
          Faturado
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="h-0.5 w-5 rounded-full border-b-2 border-dashed"
            style={{ borderColor: 'var(--fin-chart-recebido)' }}
          />
          Recebido
        </span>
      </div>
    </div>
  );
}
