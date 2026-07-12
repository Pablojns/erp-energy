import type { LucideIcon } from 'lucide-react';
import { GlassCard } from '@/src/components/shell/glass-card';

type EmptyStateProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  className?: string;
};

export function EmptyState({
  title,
  description,
  icon: Icon,
  actionLabel,
  onAction,
  compact = false,
  className = '',
}: EmptyStateProps) {
  const padding = compact ? 'p-6' : 'p-8';

  return (
    <GlassCard
      className={`border border-dashed border-[var(--border-color)] bg-[var(--input-bg)] ${padding} text-center ${className}`}
    >
      {Icon ? (
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">
          <Icon className="h-7 w-7 text-[var(--text-muted)]" strokeWidth={1.5} aria-hidden />
        </div>
      ) : null}
      <p className={`font-semibold text-[var(--text-primary)] ${compact ? 'text-base' : 'text-lg'}`}>
        {title}
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-muted)]">{description}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="erp-focus-ring erp-btn erp-btn-primary erp-btn--sm mt-5"
        >
          {actionLabel}
        </button>
      ) : actionLabel ? (
        <span className="mt-5 inline-block rounded-xl border border-[var(--border-color)] px-4 py-2 text-sm font-medium text-[var(--accent)]">
          {actionLabel}
        </span>
      ) : null}
    </GlassCard>
  );
}
