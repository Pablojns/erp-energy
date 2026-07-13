import type { PeriodPreset } from '@/src/components/dashboard/types';

const PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'mes', label: 'Este mês' },
  { id: 'trimestre', label: 'Últimos 3 meses' },
  { id: 'ano', label: 'Este ano' },
];

type PeriodSelectorProps = {
  preset: PeriodPreset;
  onPresetChange: (preset: PeriodPreset) => void;
};

export function PeriodSelector({ preset, onPresetChange }: PeriodSelectorProps) {
  return (
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
  );
}
