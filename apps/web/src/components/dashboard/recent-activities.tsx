import { DASH_SCROLL } from '@/src/components/dashboard/scroll-classes';
import type { DashboardAtividade } from '@/src/components/dashboard/types';
import {
  extractActivityEntityRef,
  formatRelativeTime,
  isRealActivity,
  translateActivityAction,
} from '@/src/components/dashboard/utils';

type RecentActivitiesProps = {
  items: DashboardAtividade[];
  userNames: Record<string, string>;
};

export function RecentActivities({ items, userNames }: RecentActivitiesProps) {
  const filtered = items.filter((item) => isRealActivity(item.action));

  return (
    <div className="dash-card w-full p-4 md:p-6 h-full">
      <h3 className="text-sm font-semibold text-[var(--dash-text)]">Atividades recentes</h3>
      <p className="mt-0.5 text-xs text-[var(--dash-text-muted)]">
        Ações operacionais registradas no sistema
      </p>

      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--dash-text-muted)]">Nenhuma atividade registrada.</p>
      ) : (
        <ul className={`mt-4 ${DASH_SCROLL} max-h-[35vh]`}>
          {filtered.map((item, i) => {
            const userLabel =
              (item.userId && userNames[item.userId]) ||
              (item.userId ? `Usuário ${item.userId.slice(0, 8)}` : 'Sistema');
            const entityRef = extractActivityEntityRef(item);

            return (
              <li key={`${item.entityId}-${item.createdAt}-${i}`} className="dash-activity-item">
                <p className="text-sm font-medium text-[var(--dash-text)]">
                  {translateActivityAction(item.action)}
                </p>
                <p className="mt-0.5 text-xs text-[var(--dash-text-muted)]">
                  {entityRef} · {userLabel}
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
    <div className="dash-card w-full space-y-4 p-4 md:p-6 h-full">
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
