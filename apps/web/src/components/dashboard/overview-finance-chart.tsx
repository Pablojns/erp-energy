'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  barHeight,
  buildBarChartLayout,
  chartDataMax,
  formatAxisMonthLabel,
  formatCompactCurrency,
} from '@/src/components/dashboard/bar-chart-layout';
import type { MonthlyOrdersPoint } from '@/src/components/dashboard/types';
import { formatCurrency } from '@/src/components/dashboard/utils';

type OverviewFinanceChartProps = {
  points: MonthlyOrdersPoint[];
};

export function OverviewFinanceChart({ points }: OverviewFinanceChartProps) {
  const clipId = useId().replace(/:/g, '');
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 320, height: 100 });
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      setSize({
        width: Math.max(Math.floor(width), 120),
        height: Math.max(Math.floor(height), 72),
      });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    const values = points.map((p) => Number(p.value) || 0);
    const yMax = chartDataMax(values);
    const count = Math.max(points.length, 1);
    const chartHeight = Math.max(size.height, 72);
    const chart = buildBarChartLayout({
      count,
      width: size.width,
      maxBarWidth: count > 18 ? 6 : count > 12 ? 8 : 10,
      minBarWidth: 3,
      height: chartHeight,
      margin: { top: 10, right: 8, bottom: 22, left: 48 },
    });

    const bars = points.map((p, i) => {
      const slot = chart.slots[i];
      const v = Number(p.value) || 0;
      const h = barHeight(v, yMax, chart.innerH);
      return {
        ...p,
        x: slot.x,
        barW: slot.barW,
        centerX: slot.centerX,
        labelY: slot.labelY,
        hitX: chart.margin.left + i * chart.slotW,
        y: chart.baselineY - h,
        barH: h,
        v,
      };
    });

    const yTicks = [0, 0.5, 1].map((t) => ({
      y: chart.margin.top + chart.innerH * (1 - t),
      value: yMax * t,
    }));

    return { ...chart, bars, yTicks, yMax };
  }, [points, size.width, size.height]);

  const active = activeIndex != null ? layout.bars[activeIndex] ?? null : null;

  if (points.length === 0) {
    return <p className="overview-empty m-auto">Sem dados no período.</p>;
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className="mb-0.5 min-h-[1rem] truncate pr-28 text-[10px] text-zinc-500"
        aria-live="polite"
      >
        {active ? (
          <>
            <span className="font-semibold text-zinc-300">{active.label}</span>
            {' · '}
            <span className="font-semibold tabular-nums text-zinc-200">
              {formatCurrency(active.v)}
            </span>
          </>
        ) : (
          'Passe o mouse para ver valores'
        )}
      </div>

      <div ref={containerRef} className="overview-chart-wrap">
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Gráfico de barras com valor de pedidos por mês"
          onMouseLeave={() => setActiveIndex(null)}
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

          {layout.yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={layout.margin.left}
                y1={tick.y}
                x2={layout.width - layout.margin.right}
                y2={tick.y}
                stroke="rgb(255 255 255 / 0.06)"
                strokeDasharray="3 3"
              />
              <text
                x={layout.margin.left - 6}
                y={tick.y + 3}
                textAnchor="end"
                fontSize="7"
                fill="rgb(113 113 122)"
                pointerEvents="none"
              >
                {formatCompactCurrency(tick.value)}
              </text>
            </g>
          ))}

          <line
            x1={layout.margin.left}
            y1={layout.baselineY}
            x2={layout.width - layout.margin.right}
            y2={layout.baselineY}
            stroke="rgb(255 255 255 / 0.1)"
            strokeWidth="1"
          />

          {layout.bars.map((b, i) => (
            <rect
              key={`hit-${b.key}`}
              x={b.hitX}
              y={layout.margin.top}
              width={layout.slotW}
              height={layout.innerH}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setActiveIndex(i)}
              onFocus={() => setActiveIndex(i)}
              tabIndex={0}
              aria-label={`${b.label}: ${formatCurrency(b.v)}`}
            />
          ))}

          <g clipPath={`url(#${clipId})`}>
            {layout.bars.map((b, i) => {
              const isActive = activeIndex === i;
              const dimmed = activeIndex != null && !isActive;
              return (
                <rect
                  key={b.key}
                  x={b.x}
                  y={b.y}
                  width={b.barW}
                  height={b.barH}
                  rx={1.5}
                  fill={isActive ? '#5BBFB0' : '#2AACE2'}
                  opacity={dimmed ? 0.3 : 0.85}
                  pointerEvents="none"
                />
              );
            })}
          </g>

          {layout.bars.map((b, i) => (
            <text
              key={`lbl-${b.key}`}
              x={b.centerX}
              y={b.labelY}
              textAnchor="middle"
              fontSize="7"
              fill={activeIndex === i ? '#e4e4e7' : 'rgb(113 113 122)'}
              fontWeight={activeIndex === i ? 600 : 400}
              pointerEvents="none"
            >
              {formatAxisMonthLabel(b.label)}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

export function OverviewFinanceChartSkeleton() {
  return <div className="overview-skeleton h-full min-h-[100px] w-full" />;
}
