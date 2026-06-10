'use client';

import { GlassCard } from '@/src/components/shell/glass-card';

const SEGMENTS = [
  { label: 'Separação', pct: 35, color: '#6366f1' },
  { label: 'Conferência', pct: 23, color: '#38bdf8' },
  { label: 'Expedição', pct: 18, color: '#a78bfa' },
  { label: 'Faturamento', pct: 14, color: '#fbbf24' },
  { label: 'Entregues', pct: 10, color: '#34d399' },
];

export function OperationalFlowChart() {
  const slices = SEGMENTS.reduce(
    (acc, segment) => {
      const span = (segment.pct / 100) * 360;
      const start = acc.angle;
      const end = acc.angle + span;
      return {
        angle: end,
        parts: [...acc.parts, `${segment.color} ${start}deg ${end}deg`],
      };
    },
    { angle: 0, parts: [] as string[] },
  ).parts.join(', ');

  return (
    <GlassCard glow="violet" className="p-5 lg:p-6">
      <h3 className="text-sm font-semibold text-[var(--text-title)]">Fluxo operacional</h3>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        Distribuição das etapas hoje — preparado para dados reais.
      </p>

      <div className="mt-6 flex flex-col items-center gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex h-44 w-44 shrink-0 items-center justify-center drop-shadow-[0_0_28px_rgba(139,92,246,0.35)]">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(${slices})`,
            }}
          />
          <div className="absolute inset-[18%] flex flex-col items-center justify-center rounded-full bg-[var(--bg-card)] ring-1 ring-[var(--border-color)]">
            <p className="text-3xl font-semibold tabular-nums text-[var(--text-title)]">86</p>
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
              total hoje
            </p>
          </div>
        </div>

        <ul className="w-full max-w-sm space-y-2.5">
          {SEGMENTS.map((segment) => (
            <li
              key={segment.label}
              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full shadow-[0_0_8px_currentColor]"
                  style={{ backgroundColor: segment.color, color: segment.color }}
                />
                <span className="text-sm text-[var(--text-primary)]">{segment.label}</span>
              </div>
              <span className="text-sm font-medium tabular-nums text-[var(--text-primary)]">
                {segment.pct}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </GlassCard>
  );
}
