'use client';

import type { LucideIcon } from 'lucide-react';
import { Bell, CircleAlert, Landmark, Truck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useCloseOverlaysOnRouteChange } from '@/src/hooks/use-close-overlays-on-route';

const NOTIFICATIONS: {
  id: string;
  title: string;
  tone: 'warning' | 'danger' | 'info';
  time: string;
  iconName: 'truck' | 'circleAlert' | 'landmark';
}[] = [
  {
    id: 'n1',
    title: 'Pedido 45173654 em atraso na conferência',
    tone: 'warning',
    time: 'Agora',
    iconName: 'truck',
  },
  {
    id: 'n2',
    title: 'Conta a pagar vence em 2 horas',
    tone: 'danger',
    time: '5 min',
    iconName: 'landmark',
  },
  {
    id: 'n3',
    title: 'Tarefa urgente atribuída para o time de expedição',
    tone: 'info',
    time: '12 min',
    iconName: 'circleAlert',
  },
];

const NOTIFY_ICONS: Record<(typeof NOTIFICATIONS)[number]['iconName'], LucideIcon> = {
  truck: Truck,
  circleAlert: CircleAlert,
  landmark: Landmark,
};

const TONE_RING: Record<(typeof NOTIFICATIONS)[number]['tone'], string> = {
  warning: 'ring-amber-400/25',
  danger: 'ring-rose-400/30',
  info: 'ring-sky-400/28',
};

const TONE_ICON: Record<(typeof NOTIFICATIONS)[number]['tone'], string> = {
  warning: 'bg-amber-500/15 text-amber-200',
  danger: 'bg-rose-500/15 text-rose-200',
  info: 'bg-sky-500/15 text-sky-200',
};

function TimeBadge({ label, tone }: { label: string; tone: (typeof NOTIFICATIONS)[number]['tone'] }) {
  const subtle: Record<(typeof NOTIFICATIONS)[number]['tone'], string> = {
    warning: 'border-amber-400/35 bg-amber-500/10 text-amber-100',
    danger: 'border-rose-400/35 bg-rose-500/10 text-rose-100',
    info: 'border-sky-400/35 bg-sky-500/10 text-sky-100',
  };

  return (
    <span
      className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold tabular-nums ${subtle[tone]}`}
    >
      {label}
    </span>
  );
}

export function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useCloseOverlaysOnRouteChange(close);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  const unreadCount = useMemo(() => NOTIFICATIONS.length, []);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className="erp-icon-btn erp-focus-ring relative flex h-10 w-10 items-center justify-center transition duration-200"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
        <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-amber-300/35 bg-gradient-to-br from-amber-300 via-amber-400 to-orange-500 px-1 text-[10px] font-bold tabular-nums text-zinc-950 shadow-[0_0_16px_rgba(251,191,36,0.55)]">
          {unreadCount}
        </span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="erp-overlay fixed inset-0 z-40 cursor-default backdrop-blur-[2px]"
            aria-label="Fechar notificações"
            onClick={() => setOpen(false)}
          />
          <div className="erp-dropdown absolute right-0 z-50 mt-3 w-[min(100vw-1.5rem,400px)] origin-top-right overflow-hidden rounded-2xl backdrop-blur-2xl">
            <div className="border-b border-erp-border bg-gradient-to-r from-sky-500/10 via-transparent to-violet-500/10 px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold tracking-tight text-erp-fg">
                      Notificações
                    </p>
                    <span className="rounded-md border border-sky-400/30 bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-200">
                      {unreadCount} novas
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-erp-fg-muted">Alertas operacionais e financeiros</p>
                </div>
                <button
                  type="button"
                  className="erp-btn-secondary shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-sky-600 transition dark:text-sky-300"
                >
                  Marcar lidas
                </button>
              </div>
            </div>

            <div className="erp-scrollbar max-h-[min(60vh,360px)] space-y-1 overflow-y-auto p-2">
              {NOTIFICATIONS.map((notification) => {
                const Icon = NOTIFY_ICONS[notification.iconName];
                return (
                  <article
                    key={notification.id}
                    className={`erp-card rounded-xl p-3 ring-1 transition duration-200 hover:border-erp-border-strong ${TONE_RING[notification.tone]}`}
                  >
                    <div className="flex gap-3">
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-white/[0.08] ${TONE_ICON[notification.tone]}`}
                      >
                        <Icon className="h-[18px] w-[18px]" strokeWidth={1.85} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-snug text-erp-fg">
                            {notification.title}
                          </p>
                          <TimeBadge label={notification.time} tone={notification.tone} />
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
