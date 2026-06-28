'use client';

import { categoriaColor, categoriaLabel, formatCurrency } from '@/src/components/financeiro/utils';

type Slice = { categoria: string; valor: number };

export function CategoryPieChart(props: { slices: Slice[] }) {
  const { slices } = props;
  const total = slices.reduce((acc, s) => acc + s.valor, 0) || 1;

  let cursor = 0;
  const segments = slices.map((s, i) => {
    const frac = s.valor / total;
    const start = cursor * 100;
    cursor += frac;
    const end = cursor * 100;
    return {
      ...s,
      color: categoriaColor(s.categoria, i),
      start,
      end,
      pct: Math.round(frac * 100),
    };
  });

  const gradient =
    segments.length > 0
      ? `conic-gradient(${segments.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(', ')})`
      : 'var(--fin-card-muted)';

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative flex h-44 w-44 items-center justify-center rounded-full"
        style={{ background: gradient }}
      >
        <div
          className="flex h-28 w-28 flex-col items-center justify-center rounded-full text-center"
          style={{ background: 'var(--fin-card)' }}
        >
          <span className="text-[10px] uppercase tracking-wider text-[var(--fin-text-muted)]">
            Total
          </span>
          <span className="text-lg font-bold tabular-nums text-[var(--fin-text)]">
            {total >= 1000 ? `${(total / 1000).toFixed(1)}k` : formatCurrency(total)}
          </span>
        </div>
      </div>
      <ul className="mt-5 w-full space-y-2">
        {segments.map((s) => (
          <li
            key={s.categoria}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <span className="inline-flex min-w-0 items-center gap-2 text-[var(--fin-text-secondary)]">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: s.color }}
              />
              <span className="truncate">{categoriaLabel(s.categoria)}</span>
            </span>
            <span className="shrink-0 tabular-nums text-[var(--fin-text)]">{s.pct}%</span>
          </li>
        ))}
        {segments.length === 0 ? (
          <li className="text-center text-xs text-[var(--fin-text-muted)]">
            Sem despesas no período
          </li>
        ) : null}
      </ul>
    </div>
  );
}
