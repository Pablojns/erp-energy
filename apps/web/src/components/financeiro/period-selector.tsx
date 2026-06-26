'use client';

import type { PeriodPreset } from '@/src/components/financeiro/types';

const PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: 'mes', label: 'Este mês' },
  { id: 'trimestre', label: 'Últimos 3 meses' },
  { id: 'ano', label: 'Este ano' },
  { id: 'personalizado', label: 'Personalizado' },
];

export function FinanceiroPeriodSelector(props: {
  preset: PeriodPreset;
  customInicio: string;
  customFim: string;
  onPresetChange: (preset: PeriodPreset) => void;
  onCustomInicioChange: (value: string) => void;
  onCustomFimChange: (value: string) => void;
}) {
  const {
    preset,
    customInicio,
    customFim,
    onPresetChange,
    onCustomInicioChange,
    onCustomFimChange,
  } = props;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPresetChange(p.id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              preset === p.id
                ? 'border-blue-500/50 bg-blue-600/20 text-blue-300'
                : 'border-white/10 bg-[#0d1320] text-zinc-400 hover:border-white/20 hover:text-zinc-200'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'personalizado' ? (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            De
            <input
              type="date"
              value={customInicio}
              onChange={(e) => onCustomInicioChange(e.target.value)}
              className="rounded-lg border border-white/10 bg-[#0d1320] px-2 py-1.5 text-xs text-zinc-100"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            Até
            <input
              type="date"
              value={customFim}
              onChange={(e) => onCustomFimChange(e.target.value)}
              className="rounded-lg border border-white/10 bg-[#0d1320] px-2 py-1.5 text-xs text-zinc-100"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
