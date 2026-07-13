'use client';

import { useId, useMemo, useState } from 'react';
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
};

export function DualMonthlyChart({
  points,
  title = 'Pedidos vs Faturado por mês',
  subtitle = 'Barras agrupadas com escala automática',
}: DualMonthlyChartProps) {
  const clipId = useId().replace(/:/g, '');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const layout = useMemo(() => {
    const pedidos = points.map((p) => Number(p.value) || 0);
    const faturado = points.map((p) => Number(p.faturado) || 0);
    const yMax = chartDataMax([...pedidos, ...faturado]);
    const chart = buildBarChartLayout({
      count: points.length,
      fixedSlotWidth: 56,
      maxBarWidth: 12,
      minBarWidth: 5,
      height: 280,
      margin: { top: 24, right: 20, bottom: 48, left: 64 },
    });

    const groupGap = 4;
    const groupW = chart.barW * 2 + groupGap;

    const bars = points.map((p, i) => {
      const slot = chart.slots[i];
      const pedVal = pedidos[i];
      const fatVal = faturado[i];
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
  }, [points]);

  const active = activeIndex != null ? layout.bars[activeIndex] ?? null : null;

  if (points.length === 0) {
    return (
      <div className="dash-card w-full p-4 md:p-6">
        <h3 className="text-sm font-semibold text-[var(--dash-text)]">{title}</h3>
        <p className="mt-8 text-center text-sm text-[var(--dash-text-muted)]">
          Sem dados para o período selecionado.
        </p>
      </div>
    );
  }

  return (
    <div className="dash-card w-full p-4 md:p-6">
      <div className="mb-1 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-[var(--dash-text)]">{title}</h3>
        <p className="text-xs text-[var(--dash-text-muted)]">{subtitle}</p>
      </div>

      <ChartHoverPanel
        label={active?.label ?? null}
        lines={
          active
            ? [
                {
                  name: 'Valor pedidos',
                  value: formatCurrency(active.pedVal),
                  color: 'var(--dash-accent)',
                },
                {
                  name: 'Valor faturado',
                  value: formatCurrency(active.fatVal),
                  color: 'var(--dash-success)',
                },
              ]
            : []
        }
      />

      <div className="dash-chart-wrap">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          preserveAspectRatio="xMidYMid meet"
          className="mx-auto block h-full w-full max-w-full"
          role="img"
          aria-label="Gráfico de barras pedidos versus faturado"
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
                x={layout.margin.left - 10}
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
                    fill="var(--dash-accent)"
                    pointerEvents="none"
                  />
                  <rect
                    x={b.fatX}
                    y={b.fatY}
                    width={b.barW}
                    height={b.fatH}
                    rx={2}
                    fill="var(--dash-success)"
                    opacity={0.9}
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

      <div className="mt-2 flex flex-wrap gap-4 text-xs text-[var(--dash-text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--dash-accent)]" />
          Valor pedidos
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--dash-success)]" />
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
