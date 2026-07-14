'use client';

const STEPS = [
  { id: 1, label: 'Em separação', shortLabel: 'Em sep.' },
  { id: 2, label: 'Separando', shortLabel: 'Sep.' },
  { id: 3, label: 'NF-e', shortLabel: 'NF' },
  { id: 4, label: 'Saída', shortLabel: 'Saída' },
] as const;

export function SeparationStepper(props: { currentStep: 1 | 2 | 3 | 4 }) {
  const { currentStep } = props;

  return (
    <div className="exp-wb-stepper-block rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
      <div className="exp-wb-stepper-inner flex flex-nowrap items-center gap-1 overflow-x-auto md:flex-wrap md:gap-2">
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
            <div key={step.id} className="flex shrink-0 items-center gap-1 md:gap-2">
              <span
                className={`exp-wb-stepper-pill inline-flex h-8 items-center rounded-full border px-2 text-xs font-semibold md:h-auto md:text-[11px] ${cls}`}
              >
                {done ? '✓ ' : `${step.id} `}
                <span className="exp-wb-stepper-label-full">{step.label}</span>
                <span className="exp-wb-stepper-label-short">{step.shortLabel}</span>
              </span>
              {idx < STEPS.length - 1 ? (
                <span className="h-px w-3 shrink-0 bg-[var(--border-color)] md:w-5" aria-hidden />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
