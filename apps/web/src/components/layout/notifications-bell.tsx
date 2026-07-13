'use client';

import { Bell } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { NotificationsDrawer } from '@/src/components/layout/notifications-drawer';
import { useCloseOverlaysOnRouteChange } from '@/src/hooks/use-close-overlays-on-route';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

const POLL_MS = 30_000;

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const close = useCallback(() => setOpen(false), []);
  useCloseOverlaysOnRouteChange(close);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await erpFetchJson<{ count: number }>(
        'notifications/unread-count',
      );
      setUnreadCount(res.count);
    } catch {
      /* polling silencioso */
    }
  }, []);

  useEffect(() => {
    void fetchUnreadCount();

    let pollId: number | null = null;
    let source: EventSource | null = null;
    let sseActive = false;

    const startPolling = () => {
      if (pollId !== null) return;
      pollId = window.setInterval(() => {
        void fetchUnreadCount();
      }, POLL_MS);
    };

    const connectSse = () => {
      source = new EventSource('/api/notifications/stream');
      source.addEventListener('open', () => {
        sseActive = true;
        if (pollId !== null) {
          window.clearInterval(pollId);
          pollId = null;
        }
      });
      source.addEventListener('unread_count', (event) => {
        try {
          const payload = JSON.parse(event.data) as { count: number };
          setUnreadCount(payload.count);
        } catch {
          /* ignore */
        }
      });
      source.onerror = () => {
        sseActive = false;
        source?.close();
        source = null;
        startPolling();
      };
    };

    connectSse();
    if (!sseActive) startPolling();

    return () => {
      if (pollId !== null) window.clearInterval(pollId);
      source?.close();
    };
  }, [fetchUnreadCount]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="erp-icon-btn erp-focus-ring relative flex h-10 w-10 items-center justify-center transition duration-200"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Notificações"
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-red-400/40 bg-red-600 px-1 text-[10px] font-bold tabular-nums text-white shadow-[0_0_12px_rgba(220,38,38,0.45)]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      <NotificationsDrawer
        open={open}
        onClose={() => {
          close();
          void fetchUnreadCount();
        }}
      />
    </>
  );
}
