'use client';

export type ChartHoverLine = {
  name: string;
  value: string;
  color?: string;
};

export function ChartHoverPanel(props: {
  label: string | null;
  lines: ChartHoverLine[];
  hint?: string;
}) {
  const { label, lines, hint = 'Passe o mouse sobre uma barra para ver os valores' } = props;

  if (!label) {
    return (
      <p className="mb-2 min-h-[2rem] text-xs leading-8 text-[var(--dash-text-muted)]">
        {hint}
      </p>
    );
  }

  return (
    <div
      className="mb-2 flex min-h-[2rem] flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-3 py-1.5 text-xs"
      style={{
        borderColor: 'var(--dash-border)',
        background: 'color-mix(in srgb, var(--dash-accent) 6%, var(--dash-card))',
      }}
    >
      <span className="font-semibold text-[var(--dash-text)]">{label}</span>
      {lines.map((line) => (
        <span key={line.name} className="inline-flex items-center gap-1.5 text-[var(--dash-text-secondary)]">
          {line.color ? (
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-sm"
              style={{ background: line.color }}
            />
          ) : null}
          <span>
            {line.name}:{' '}
            <strong className="font-semibold text-[var(--dash-text)]">{line.value}</strong>
          </span>
        </span>
      ))}
    </div>
  );
}

export function FinChartHoverPanel(props: {
  label: string | null;
  lines: ChartHoverLine[];
}) {
  const { label, lines } = props;

  if (!label) {
    return (
      <p className="mb-2 min-h-[2rem] text-xs leading-8 text-[var(--fin-text-muted)]">
        Passe o mouse sobre uma barra para ver os valores
      </p>
    );
  }

  return (
    <div
      className="mb-2 flex min-h-[2rem] flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-3 py-1.5 text-xs"
      style={{
        borderColor: 'var(--fin-border)',
        background: 'var(--fin-card-muted)',
      }}
    >
      <span className="font-semibold text-[var(--fin-text)]">{label}</span>
      {lines.map((line) => (
        <span key={line.name} className="inline-flex items-center gap-1.5 text-[var(--fin-text-secondary)]">
          {line.color ? (
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-sm"
              style={{ background: line.color }}
            />
          ) : null}
          <span>
            {line.name}:{' '}
            <strong className="font-semibold text-[var(--fin-text)]">{line.value}</strong>
          </span>
        </span>
      ))}
    </div>
  );
}
