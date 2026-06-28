import type { PeriodPreset } from '@/src/components/dashboard/types';

const PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'mes', label: 'Este mês' },
  { id: 'trimestre', label: 'Últimos 3 meses' },
  { id: 'ano', label: 'Este ano' },
  { id: 'personalizado', label: 'Personalizado' },
];

type PeriodSelectorProps = {
  preset: PeriodPreset;
  customInicio: string;
  customFim: string;
  onPresetChange: (preset: PeriodPreset) => void;
  onCustomInicioChange: (value: string) => void;
  onCustomFimChange: (value: string) => void;
};

export function PeriodSelector({
  preset,
  customInicio,
  customFim,
  onPresetChange,
  onCustomInicioChange,
  onCustomFimChange,
}: PeriodSelectorProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`dash-period-btn ${preset === p.id ? 'dash-period-btn--active' : ''}`}
            onClick={() => onPresetChange(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'personalizado' ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-[var(--dash-text-muted)]">
            De
            <input
              type="date"
              value={customInicio}
              onChange={(e) => onCustomInicioChange(e.target.value)}
              className="rounded-md border border-[var(--dash-border)] bg-[var(--dash-card)] px-2 py-1 text-xs text-[var(--dash-text)]"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--dash-text-muted)]">
            Até
            <input
              type="date"
              value={customFim}
              onChange={(e) => onCustomFimChange(e.target.value)}
              className="rounded-md border border-[var(--dash-border)] bg-[var(--dash-card)] px-2 py-1 text-xs text-[var(--dash-text)]"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
