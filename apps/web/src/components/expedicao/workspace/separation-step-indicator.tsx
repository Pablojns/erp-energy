'use client';

import {
  getSeparationWorkflowStepMeta,
  SEPARATION_WORKFLOW_STEPS,
  type SeparationWorkflowStep,
} from '@/src/components/expedicao/shared/separation-workflow';

export function SeparationStepIndicator(props: {
  currentStep: SeparationWorkflowStep;
  compact?: boolean;
}) {
  const { currentStep, compact = false } = props;
  const meta = getSeparationWorkflowStepMeta(currentStep);

  if (compact) {
    return (
      <span
        className="inline-flex items-center rounded-full border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]"
        title={`Etapa ${currentStep} de ${SEPARATION_WORKFLOW_STEPS.length}: ${meta.label}`}
      >
        {currentStep}. {meta.shortLabel}
      </span>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      title={`Etapa ${currentStep} de ${SEPARATION_WORKFLOW_STEPS.length}: ${meta.label}`}
    >
      {SEPARATION_WORKFLOW_STEPS.map((step) => {
        const active = step.id === currentStep;
        const done = step.id < currentStep;
        const cls = done
          ? 'bg-[var(--success)] text-[var(--color-text-inverse)]'
          : active
            ? 'bg-[var(--accent)] text-[var(--color-text-inverse)]'
            : 'bg-[var(--input-bg)] text-[var(--text-muted)]';
        return (
          <span
            key={step.id}
            className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[9px] font-bold ${cls}`}
            aria-label={step.label}
          >
            {done ? '✓' : step.id}
          </span>
        );
      })}
      <span className="ml-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
        {meta.label}
      </span>
    </div>
  );
}
