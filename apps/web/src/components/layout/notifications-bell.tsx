'use client';

import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { formatRelativeTime } from '@/src/components/dashboard/utils';
import { useCloseOverlaysOnRouteChange } from '@/src/hooks/use-close-overlays-on-route';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  link: string | null;
  createdAt: string;
};

type UnreadCountResponse = {
  count: number;
};

const POLL_MS = 30_000;

function resolveNotificationHref(link: string | null | undefined): string | null {
  if (!link) return null;
  if (link.startsWith('/')) return link;
  if (link.startsWith('order:')) return '/app/expedicao/pedidos';
  if (link.startsWith('product:')) return '/app/estoque';
  return null;
}

export function NotificationsBell() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  useCloseOverlaysOnRouteChange(close);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await erpFetchJson<UnreadCountResponse>('notifications/unread-count');
      setUnreadCount(res.count);
    } catch {
      /* polling silencioso */
    }
  }, []);

  const fetchList = useCallback(async () => {
    setLoadingList(true);
    try {
      const rows = await erpFetchJson<NotificationRow[]>('notifications');
      setItems(rows);
    } catch {
      setItems([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void fetchUnreadCount();
    const id = window.setInterval(() => {
      void fetchUnreadCount();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (!open) return;
    void fetchList();
    void fetchUnreadCount();
  }, [open, fetchList, fetchUnreadCount]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, close]);

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await erpFetchJson('notifications/read-all', { method: 'PATCH' });
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      /* mantém estado atual */
    } finally {
      setMarkingAll(false);
    }
  };

  const handleNotificationClick = async (notification: NotificationRow) => {
    if (!notification.read) {
      try {
        await erpFetchJson(`notifications/${notification.id}/read`, {
          method: 'PATCH',
        });
        setItems((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        /* segue para navegação mesmo se falhar */
      }
    }

    const href = resolveNotificationHref(notification.link);
    close();
    if (href) {
      router.push(href);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="erp-icon-btn erp-focus-ring relative flex h-10 w-10 items-center justify-center transition duration-200"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Notificações"
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-red-400/40 bg-red-600 px-1 text-[10px] font-bold tabular-nums text-white shadow-[0_0_12px_rgba(220,38,38,0.45)]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="erp-module-card absolute right-0 z-50 mt-3 w-[min(100vw-1.5rem,380px)] origin-top-right overflow-hidden shadow-lg">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <p className="text-sm font-semibold text-white">Notificações</p>
            {unreadCount > 0 ? (
              <button
                type="button"
                disabled={markingAll}
                onClick={() => void handleMarkAllRead()}
                className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-sky-300 transition hover:bg-white/10 disabled:opacity-50"
              >
                Marcar todas como lidas
              </button>
            ) : null}
          </div>

          <div className="max-h-80 overflow-y-auto erp-scrollbar">
            {loadingList ? (
              <p className="px-4 py-8 text-center text-sm text-white/50">Carregando…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-white/50">
                Nenhuma notificação
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {items.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => void handleNotificationClick(notification)}
                      className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-white/[0.04] ${
                        !notification.read ? 'bg-white/[0.06]' : ''
                      }`}
                    >
                      {!notification.read ? (
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-400"
                          aria-hidden
                        />
                      ) : (
                        <span className="mt-1.5 h-2 w-2 shrink-0" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-sm font-medium leading-snug text-white">
                            {notification.title}
                          </span>
                          <span className="shrink-0 text-[10px] tabular-nums text-white/40">
                            {formatRelativeTime(notification.createdAt)}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-white/60">
                          {notification.message}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
