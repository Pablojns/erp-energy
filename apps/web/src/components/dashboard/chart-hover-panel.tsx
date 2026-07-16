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
  const active = Boolean(label);

  return (
    <div className="dash-chart-hover-slot mb-1.5">
      <div
        className={`dash-chart-hover-panel ${active ? 'dash-chart-hover-panel--active' : ''}`}
        aria-live="polite"
      >
        {active ? (
          <>
            <span className="font-semibold text-[var(--dash-text)]">{label}</span>
            {lines.map((line) => (
              <span
                key={line.name}
                className="inline-flex items-center gap-1.5 text-[var(--dash-text-muted)]"
              >
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
          </>
        ) : (
          <span className="text-[var(--dash-text-muted)]">{hint}</span>
        )}
      </div>
    </div>
  );
}

export function FinChartHoverPanel(props: {
  label: string | null;
  lines: ChartHoverLine[];
}) {
  return (
    <ChartHoverPanel
      label={props.label}
      lines={props.lines}
      hint="Passe o mouse sobre uma barra para ver os valores"
    />
  );
}
