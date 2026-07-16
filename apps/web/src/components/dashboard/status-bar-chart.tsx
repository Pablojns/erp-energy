'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  barHeight,
  buildBarChartLayout,
  chartDataMax,
} from '@/src/components/dashboard/bar-chart-layout';
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
  const clipId = useId().replace(/:/g, '');
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: 220 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      setSize({
        width: Math.max(Math.floor(width), 200),
        height: Math.max(Math.floor(height), 140),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const items = ORDER.map((k) => ({ key: k, value: Number(fluxo[k]) || 0 }));
  const max = Math.max(...items.map((i) => i.value), 1);

  const layout = useMemo(() => {
    const chart = buildBarChartLayout({
      count: ORDER.length,
      width: size.width,
      height: size.height,
      maxBarWidth: 48,
      minBarWidth: 14,
      margin: { top: 20, right: 12, bottom: 44, left: 12 },
    });

    const bars = ORDER.map((key, i) => {
      const item = { key, value: Number(fluxo[key]) || 0 };
      const slot = chart.slots[i];
      const rawH = item.value === 0 ? 0 : (item.value / max) * chart.innerH;
      const h = item.value === 0 ? 0 : Math.max(8, rawH);
      const valueY =
        item.value === 0
          ? chart.baselineY - 12
          : Math.max(chart.margin.top + 14, chart.baselineY - h - 10);

      return {
        ...item,
        x: slot.x,
        barW: slot.barW,
        centerX: slot.centerX,
        labelY: slot.labelY,
        y: chart.baselineY - h,
        h,
        valueY,
      };
    });

    return { ...chart, bars };
  }, [fluxo, max, size.height, size.width]);

  return (
    <div className="dash-card flex h-full min-h-0 w-full flex-col p-2 md:p-3">
      <h3 className="mb-1 shrink-0 text-sm font-semibold text-[var(--dash-text)]">
        Pedidos por status
      </h3>
      <div ref={containerRef} className="dash-chart-wrap dash-chart-wrap--fill min-h-0 flex-1">
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          preserveAspectRatio="xMidYMid meet"
          className="block h-full w-full max-h-full"
          role="img"
          aria-label="Gráfico de barras por status de pedido"
        >
          <defs>
            <clipPath id={clipId}>
              <rect
                x={layout.margin.left}
                y={layout.margin.top}
                width={layout.innerW}
                height={layout.innerH}
              />
            </clipPath>
          </defs>

          <line
            x1={layout.margin.left}
            y1={layout.baselineY}
            x2={layout.width - layout.margin.right}
            y2={layout.baselineY}
            stroke="var(--dash-border)"
            strokeWidth="1"
          />

          {layout.bars.map((item) => (
            <g key={item.key}>
              {item.value > 0 ? (
                <rect
                  x={item.x}
                  y={item.y}
                  width={item.barW}
                  height={item.h}
                  rx={4}
                  fill={FLUXO_COLORS[item.key] ?? '#64748b'}
                  opacity={0.92}
                />
              ) : (
                <line
                  x1={item.x + 4}
                  y1={layout.baselineY - 1}
                  x2={item.x + item.barW - 4}
                  y2={layout.baselineY - 1}
                  stroke={FLUXO_COLORS[item.key] ?? '#64748b'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity={0.45}
                />
              )}
              <text
                x={item.centerX}
                y={item.valueY}
                textAnchor="middle"
                fontSize="12"
                fill="var(--dash-text)"
                fontWeight="600"
              >
                {formatNumber(item.value)}
              </text>
              <text
                x={item.centerX}
                y={item.labelY}
                textAnchor="middle"
                fontSize="11"
                fill="var(--dash-text-muted)"
              >
                {FLUXO_LABELS[item.key]}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

export function StatusBarChartSkeleton() {
  return (
    <div className="dash-card flex h-full min-h-0 w-full flex-col p-2 md:p-3">
      <div className="dash-skeleton mb-2 h-4 w-40 shrink-0" />
      <div className="dash-skeleton min-h-[140px] w-full flex-1 rounded-lg" />
    </div>
  );
}
