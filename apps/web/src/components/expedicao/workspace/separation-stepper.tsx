'use client';

const STEPS = [
  { id: 1, label: 'Em separação' },
  { id: 2, label: 'Separando' },
  { id: 3, label: 'NF-e' },
  { id: 4, label: 'Saída' },
] as const;

export function SeparationStepper(props: { currentStep: 1 | 2 | 3 | 4 }) {
  const { currentStep } = props;

  return (
    <div className="exp-wb-stepper-block rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
      <div className="exp-wb-stepper-inner flex flex-wrap items-center gap-2">
        {STEPS.map((step, idx) => {
          const active = step.id === currentStep;
          const isWorkflowComplete = currentStep === STEPS.length;
          const done = step.id < currentStep || (active && isWorkflowComplete);
          const cls = done
            ? 'border-transparent bg-[var(--success)] text-[var(--color-text-inverse)]'
            : active
              ? 'border-transparent bg-[var(--accent)] text-[var(--color-text-inverse)]'
              : 'border-[var(--border-color)] bg-[var(--input-bg)] text-[var(--text-muted)]';
          return (
            <div key={step.id} className="flex items-center gap-2">
              <span
                className={`exp-wb-stepper-pill inline-flex items-center rounded-full border px-2 text-[11px] font-semibold ${cls}`}
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
