import type { DashboardAtividade } from '@/src/components/dashboard/types';
import { formatRelativeTime } from '@/src/components/dashboard/utils';

type RecentActivitiesProps = {
  items: DashboardAtividade[];
  userNames: Record<string, string>;
};

function formatAction(action: string): string {
  return action
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function RecentActivities({ items, userNames }: RecentActivitiesProps) {
  return (
    <div className="dash-card p-4 sm:p-5 h-full">
      <h2 className="text-sm font-semibold text-[var(--dash-text)]">Atividades recentes</h2>
      <p className="mt-0.5 text-xs text-[var(--dash-text-muted)]">Últimas ações no sistema</p>

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--dash-text-muted)]">Nenhuma atividade registrada.</p>
      ) : (
        <ul className="mt-4 max-h-72 overflow-y-auto">
          {items.map((item, i) => {
            const userLabel =
              (item.userId && userNames[item.userId]) ||
              (item.userId ? `Usuário ${item.userId.slice(0, 8)}` : 'Sistema');
            return (
              <li key={`${item.entityId}-${item.createdAt}-${i}`} className="dash-activity-item">
                <p className="text-sm font-medium text-[var(--dash-text)]">
                  {formatAction(item.action)}
                </p>
                <p className="mt-0.5 text-xs text-[var(--dash-text-muted)]">
                  {item.entityId} · {userLabel}
                </p>
                <p className="mt-0.5 text-xs text-[var(--dash-text-muted)]">
                  {formatRelativeTime(item.createdAt)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function RecentActivitiesSkeleton() {
  return (
    <div className="dash-card p-5 space-y-4 h-full">
      <div className="dash-skeleton h-4 w-40" />
      <div className="dash-skeleton h-3 w-48" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="dash-skeleton h-4 w-3/4" />
            <div className="dash-skeleton h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
