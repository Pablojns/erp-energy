'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  barHeight,
  buildBarChartLayout,
  chartDataMax,
  formatAxisMonthLabel,
  formatCompactCurrency,
} from '@/src/components/dashboard/bar-chart-layout';
import { ChartHoverPanel } from '@/src/components/dashboard/chart-hover-panel';
import type { MonthlyOrdersPoint } from '@/src/components/dashboard/types';
import { formatCurrency } from '@/src/components/dashboard/utils';

type DualMonthlyChartProps = {
  points: MonthlyOrdersPoint[];
  title?: string;
  subtitle?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  primaryColor?: string;
  secondaryColor?: string;
};

export function DualMonthlyChart({
  points,
  title = 'Pedidos vs Faturado por mês',
  subtitle = 'Barras agrupadas com escala automática',
  primaryLabel = 'Valor pedidos',
  secondaryLabel = 'Valor faturado',
  primaryColor = 'var(--dash-accent)',
  secondaryColor = 'var(--dash-success)',
}: DualMonthlyChartProps) {
  const clipId = useId().replace(/:/g, '');
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: 220 });
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      setSize({
        width: Math.max(Math.floor(width), 200),
        height: Math.max(Math.floor(height), 120),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    const primary = points.map((p) => Number(p.value) || 0);
    const secondary = points.map((p) => Number(p.faturado) || 0);
    const yMax = chartDataMax([...primary, ...secondary]);
    const chart = buildBarChartLayout({
      count: Math.max(points.length, 1),
      width: size.width,
      height: size.height,
      maxBarWidth: points.length > 14 ? 8 : points.length > 10 ? 10 : 14,
      minBarWidth: 3,
      margin: { top: 12, right: 12, bottom: 28, left: 52 },
    });

    const groupGap = 3;
    const groupW = chart.barW * 2 + groupGap;

    const bars = points.map((p, i) => {
      const slot = chart.slots[i];
      const pedVal = primary[i];
      const fatVal = secondary[i];
      const pedH = barHeight(pedVal, yMax, chart.innerH);
      const fatH = barHeight(fatVal, yMax, chart.innerH);
      const groupX = slot.centerX - groupW / 2;
      return {
        ...p,
        labelX: slot.centerX,
        labelY: slot.labelY,
        hitX: chart.margin.left + i * chart.slotW,
        pedX: groupX,
        fatX: groupX + chart.barW + groupGap,
        pedY: chart.baselineY - pedH,
        fatY: chart.baselineY - fatH,
        pedH,
        fatH,
        pedVal,
        fatVal,
        barW: chart.barW,
      };
    });

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
      y: chart.margin.top + chart.innerH * (1 - t),
      value: yMax * t,
    }));

    return { ...chart, bars, yTicks, yMax };
  }, [points, size.height, size.width]);

  const active = activeIndex != null ? layout.bars[activeIndex] ?? null : null;

  if (points.length === 0) {
    return (
      <div className="dash-card flex h-full min-h-0 w-full flex-col p-2 md:p-3">
        <h3 className="text-sm font-semibold text-[var(--dash-text)]">{title}</h3>
        <p className="mt-8 text-center text-sm text-[var(--dash-text-muted)]">
          Sem dados para o período selecionado.
        </p>
      </div>
    );
  }

  return (
    <div className="dash-card flex h-full min-h-0 w-full flex-col p-2 md:p-3">
      <div className="mb-0.5 flex shrink-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--dash-text)]">{title}</h3>
          <p className="text-xs text-[var(--dash-text-muted)]">{subtitle}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs text-[var(--dash-text-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: primaryColor }}
            />
            {primaryLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: secondaryColor }}
            />
            {secondaryLabel}
          </span>
        </div>
      </div>

      <div className="shrink-0">
        <ChartHoverPanel
          label={active?.label ?? null}
          lines={
            active
              ? [
                  {
                    name: primaryLabel,
                    value: formatCurrency(active.pedVal),
                    color: primaryColor,
                  },
                  {
                    name: secondaryLabel,
                    value: formatCurrency(active.fatVal),
                    color: secondaryColor,
                  },
                ]
              : []
          }
        />
      </div>

      <div ref={containerRef} className="dash-chart-wrap dash-chart-wrap--fill min-h-0 flex-1">
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          preserveAspectRatio="none"
          className="block h-full w-full"
          role="img"
          aria-label={`${primaryLabel} versus ${secondaryLabel}`}
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
                stroke="var(--dash-chart-grid)"
                strokeDasharray="4 4"
              />
              <text
                x={layout.margin.left - 8}
                y={tick.y + 4}
                textAnchor="end"
                fontSize="10"
                fill="var(--dash-text-muted)"
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
            stroke="var(--dash-border)"
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
            />
          ))}

          <g clipPath={`url(#${clipId})`}>
            {layout.bars.map((b, i) => {
              const dimmed = activeIndex != null && activeIndex !== i;
              return (
                <g key={b.key} opacity={dimmed ? 0.28 : 1}>
                  <rect
                    x={b.pedX}
                    y={b.pedY}
                    width={b.barW}
                    height={b.pedH}
                    rx={2}
                    fill={primaryColor}
                    pointerEvents="none"
                  />
                  <rect
                    x={b.fatX}
                    y={b.fatY}
                    width={b.barW}
                    height={b.fatH}
                    rx={2}
                    fill={secondaryColor}
                    opacity={0.95}
                    pointerEvents="none"
                  />
                </g>
              );
            })}
          </g>

          {layout.bars.map((b, i) => (
            <text
              key={`lbl-${b.key}`}
              x={b.labelX}
              y={b.labelY}
              textAnchor="middle"
              fontSize="10"
              fill={activeIndex === i ? 'var(--dash-text)' : 'var(--dash-text-muted)'}
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

export function DualMonthlyChartSkeleton() {
  return (
    <div className="dash-card flex h-full min-h-0 w-full flex-col space-y-3 p-2 md:p-3">
      <div className="dash-skeleton h-4 w-56" />
      <div className="dash-skeleton min-h-[120px] w-full flex-1 rounded-lg" />
    </div>
  );
}
