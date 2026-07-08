type StatusTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'accent';

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'erp-badge erp-badge-neutral',
  success: 'erp-badge erp-badge-success',
  warning: 'erp-badge erp-badge-warning',
  danger: 'erp-badge erp-badge-danger',
  info: 'erp-badge erp-badge-info',
  accent: 'erp-badge erp-badge-accent',
};

type StatusBadgeProps = {
  label: string;
  tone?: StatusTone;
};

export function StatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
  return (
    <span
      className={`erp-badge inline-flex max-w-full items-center rounded-md px-2 py-0.5 text-xs font-semibold leading-none tracking-wide ring-1 ring-inset ${TONE_CLASSES[tone]}`}
    >
      {label}
    </span>
  );
}
