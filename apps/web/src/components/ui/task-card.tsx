import { StatusBadge } from './status-badge';
import { GlassCard } from '@/src/components/shell/glass-card';

type TaskCardProps = {
  title: string;
  owner: string;
  due: string;
  priority: 'normal' | 'high' | 'critical';
};

const PRIORITY_TONE: Record<TaskCardProps['priority'], 'info' | 'warning' | 'danger'> =
  {
    normal: 'info',
    high: 'warning',
    critical: 'danger',
  };

export function TaskCard({ title, owner, due, priority }: TaskCardProps) {
  return (
    <GlassCard
      hover
      className="border border-[var(--border-color)] bg-[var(--input-bg)] p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium text-[var(--text-primary)]">{title}</h4>
        <StatusBadge
          label={
            priority === 'critical' ? 'Crítica' : priority === 'high' ? 'Alta' : 'Normal'
          }
          tone={PRIORITY_TONE[priority]}
        />
      </div>
      <p className="mt-3 text-xs text-[var(--text-secondary)]">Responsável: <span className="text-[var(--text-primary)]">{owner}</span></p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">Prazo: <span className="text-[var(--text-primary)]">{due}</span></p>
    </GlassCard>
  );
}
