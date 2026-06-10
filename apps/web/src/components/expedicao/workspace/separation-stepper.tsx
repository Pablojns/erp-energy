'use client';

const STEPS = [
  { id: 1, label: 'Em sep.' },
  { id: 2, label: 'Separando' },
  { id: 3, label: 'Concluído' },
  { id: 4, label: 'NF-e' },
  { id: 5, label: 'Saída' },
] as const;

export function SeparationStepper(props: { currentStep: 1 | 2 | 3 | 4 | 5 }) {
  const { currentStep } = props;

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        {STEPS.map((step, idx) => {
          const done = step.id < currentStep;
          const active = step.id === currentStep;
          const cls = done
            ? 'border-transparent bg-[#22c55e] text-white'
            : active
              ? 'border-transparent bg-[var(--accent)] text-white'
              : 'border-[var(--border-color)] bg-[var(--input-bg)] text-[var(--text-muted)]';
          return (
            <div key={step.id} className="flex items-center gap-2">
              <span
                className={`inline-flex h-7 items-center rounded-full border px-3 text-[11px] font-semibold ${cls}`}
              >
                {done ? '✓ ' : `${step.id} `}
                {step.label}
              </span>
              {idx < STEPS.length - 1 ? (
                <span className="h-px w-5 bg-[var(--border-color)]" aria-hidden />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

