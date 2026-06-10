import { GlassCard } from '@/src/components/shell/glass-card';

type QuickAction = {
  label: string;
  description: string;
};

type QuickActionsProps = {
  title?: string;
  actions: QuickAction[];
};

export function QuickActions({ title, actions }: QuickActionsProps) {
  return (
    <GlassCard className="border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          {title ?? 'Ações rápidas'}
        </h3>
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Cmd+K
        </span>
      </div>

      <div className="space-y-2">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-3 text-left shadow-sm transition duration-200 hover:bg-[var(--input-bg)]"
          >
            <p className="text-sm font-medium text-[var(--text-primary)]">{action.label}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{action.description}</p>
          </button>
        ))}
      </div>
    </GlassCard>
  );
}
