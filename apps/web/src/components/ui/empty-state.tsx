import { GlassCard } from '@/src/components/shell/glass-card';

type EmptyStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
};

export function EmptyState({ title, description, actionLabel }: EmptyStateProps) {
  return (
    <GlassCard className="border border-dashed border-[var(--border-color)] bg-[var(--input-bg)] p-8 text-center">
      <p className="text-lg font-semibold text-[var(--text-primary)]">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-muted)]">{description}</p>
      {actionLabel ? (
        <button
          type="button"
          className="mt-5 rounded-xl border border-[var(--border-color)] px-4 py-2 text-sm font-medium text-[var(--accent)] transition hover:bg-[var(--bg-card)]"
        >
          {actionLabel}
        </button>
      ) : null}
    </GlassCard>
  );
}
