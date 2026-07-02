'use client';

import { useMemo, useState } from 'react';
import {
  formatCompactCurrency,
  shouldShowXLabel,
} from '@/src/components/dashboard/bar-chart-layout';
import { FinChartHoverPanel } from '@/src/components/dashboard/chart-hover-panel';
import type { RevenueChartPoint } from '@/src/components/financeiro/types';
import { formatCurrency } from '@/src/components/financeiro/utils';

export function RevenueChart(props: {
  points: RevenueChartPoint[];
  loading?: boolean;
}) {
  const { points, loading } = props;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const layout = useMemo(() => {
    const width = 640;
    const height = 240;
    const pad = { top: 20, right: 12, bottom: 40, left: 56 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const maxVal =
      Math.max(1, ...points.flatMap((p) => [p.faturado, p.recebido])) * 1.12;

    const slotW = points.length > 0 ? plotW / points.length : plotW;
    const groupW = Math.min(48, slotW * 0.72);
    const barW = groupW * 0.42;
    const gap = groupW * 0.08;
    const baselineY = pad.top + plotH;

    const bars = points.map((p, i) => {
      const fatH = (p.faturado / maxVal) * plotH;
      const recH = (p.recebido / maxVal) * plotH;
      const slotX = pad.left + i * slotW + (slotW - groupW) / 2;
      return {
        ...p,
        slotX,
        hitX: pad.left + i * slotW,
        centerX: pad.left + i * slotW + slotW / 2,
        fatY: baselineY - fatH,
        recY: baselineY - recH,
        fatH,
        recH,
        barW,
        recX: slotX + barW + gap,
      };
    });

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
      y: pad.top + plotH * (1 - t),
      value: maxVal * t,
    }));

    return { width, height, pad, plotW, plotH, baselineY, slotW, bars, yTicks, maxVal };
  }, [points]);

  const active = activeIndex != null ? layout.bars[activeIndex] ?? null : null;

  if (loading) return null;

  return (
    <div className="w-full">
      <FinChartHoverPanel
        label={active?.label ?? null}
        lines={
          active
            ? [
                {
                  name: 'Faturado',
                  value: formatCurrency(active.faturado),
                  color: 'var(--fin-chart-faturado)',
                },
                {
                  name: 'Recebido',
                  value: formatCurrency(active.recebido),
                  color: 'var(--fin-chart-recebido)',
                },
              ]
            : []
        }
      />

      <div className="overflow-hidden" style={{ height: 240 }}>
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          preserveAspectRatio="xMidYMid meet"
          className="block h-full w-full"
          role="img"
          aria-label="Gráfico de barras faturado versus recebido"
          onMouseLeave={() => setActiveIndex(null)}
        >
          {layout.yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={layout.pad.left}
                y1={tick.y}
                x2={layout.width - layout.pad.right}
                y2={tick.y}
                stroke="var(--fin-chart-grid)"
                strokeWidth="1"
              />
              <text
                x={layout.pad.left - 8}
                y={tick.y + 4}
                textAnchor="end"
                fontSize="10"
                className="fill-[var(--fin-text-muted)]"
              >
                {formatCompactCurrency(tick.value)}
              </text>
            </g>
          ))}

          <line
            x1={layout.pad.left}
            y1={layout.baselineY}
            x2={layout.width - layout.pad.right}
            y2={layout.baselineY}
            stroke="var(--fin-border)"
          />

          {points.length > 0 ? (
            <>
              {layout.bars.map((b, i) => {
                const dimmed = activeIndex != null && activeIndex !== i;
                return (
                  <g key={`${b.label}-${i}`} opacity={dimmed ? 0.3 : 1}>
                    <rect
                      x={b.slotX}
                      y={b.fatY}
                      width={b.barW}
                      height={Math.max(b.fatH, b.faturado > 0 ? 2 : 0)}
                      rx={3}
                      fill="var(--fin-chart-faturado)"
                    />
                    <rect
                      x={b.recX}
                      y={b.recY}
                      width={b.barW}
                      height={Math.max(b.recH, b.recebido > 0 ? 2 : 0)}
                      rx={3}
                      fill="var(--fin-chart-recebido)"
                      opacity={0.85}
                    />
                  </g>
                );
              })}

              {layout.bars.map((b, i) =>
                shouldShowXLabel(i, layout.bars.length) ? (
                  <text
                    key={`lbl-${b.label}-${i}`}
                    x={b.centerX}
                    y={layout.height - 8}
                    textAnchor="middle"
                    className="fill-[var(--fin-text-muted)] text-[10px]"
                    fontWeight={activeIndex === i ? 600 : 400}
                  >
                    {b.label}
                  </text>
                ) : null,
              )}

              {layout.bars.map((b, i) => (
                <rect
                  key={`hit-${b.label}-${i}`}
                  x={b.hitX}
                  y={layout.pad.top}
                  width={layout.slotW}
                  height={layout.plotH + layout.pad.bottom}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setActiveIndex(i)}
                  onFocus={() => setActiveIndex(i)}
                  tabIndex={0}
                  aria-label={`${b.label}: faturado ${formatCurrency(b.faturado)}, recebido ${formatCurrency(b.recebido)}`}
                />
              ))}
            </>
          ) : (
            <text
              x={layout.width / 2}
              y={layout.height / 2}
              textAnchor="middle"
              className="fill-[var(--fin-text-muted)] text-sm"
            >
              Sem dados no período
            </text>
          )}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap justify-center gap-4 text-xs text-[var(--fin-text-secondary)]">
        <span className="inline-flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: 'var(--fin-chart-faturado)' }}
          />
          Faturado
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: 'var(--fin-chart-recebido)' }}
          />
          Recebido
        </span>
      </div>
    </div>
  );
}
