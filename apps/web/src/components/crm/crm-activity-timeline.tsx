'use client';

import {
  formatCrmDateTime,
  type CrmActivityItem,
} from '@/src/components/crm/crm-helpers';

export function CrmActivityTimeline(props: { items: CrmActivityItem[] }) {
  if (props.items.length === 0) {
    return (
      <p className="text-xs text-[var(--text-muted)]">
        Nenhuma atividade registrada ainda.
      </p>
    );
  }

  return (
    <ol className="relative space-y-0 border-l border-[var(--border-color)] pl-4">
      {props.items.map((item, index) => (
        <li key={item.id} className="relative pb-4 last:pb-0">
          <span
            className={`absolute -left-[1.35rem] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-[var(--bg-card)] ${
              item.kind === 'note'
                ? 'bg-amber-400'
                : item.kind === 'touchpoint'
                  ? 'bg-emerald-400'
                  : 'bg-blue-400'
            }`}
          />
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                {item.type}
              </p>
              <time className="text-[10px] text-[var(--text-muted)]">
                {formatCrmDateTime(item.at)}
              </time>
            </div>
            {item.channel ? (
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Canal: <span className="font-medium">{item.channel}</span>
              </p>
            ) : null}
            {item.note ? (
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{item.note}</p>
            ) : null}
          </div>
          {index < props.items.length - 1 ? null : null}
        </li>
      ))}
    </ol>
  );
}
