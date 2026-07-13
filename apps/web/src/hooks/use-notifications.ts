'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import type {
  NotificationDto,
  NotificationTab,
  NotificationsListResponse,
  SnoozeDuration,
} from '@/src/services/api/notifications-api';

const POLL_MS = 30_000;
const PAGE_SIZE = 20;

type UseNotificationsOptions = {
  enabled?: boolean;
};

export function useNotifications(options: UseNotificationsOptions = {}) {
  const enabled = options.enabled ?? true;
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [tab, setTab] = useState<NotificationTab>('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollRef = useRef<number | null>(null);
  const sseConnectedRef = useRef(false);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await erpFetchJson<{ count: number }>(
        'notifications/unread-count',
      );
      setUnreadCount(res.count);
    } catch {
      /* silencioso */
    }
  }, []);

  const buildQuery = useCallback(
    (nextPage: number) => {
      const params = new URLSearchParams();
      params.set('page', String(nextPage));
      params.set('pageSize', String(PAGE_SIZE));
      if (tab === 'unread') params.set('read', 'false');
      if (tab === 'urgent') params.set('priority', 'urgent');
      return params.toString();
    },
    [tab],
  );

  const fetchPage = useCallback(
    async (nextPage: number, append: boolean) => {
      if (nextPage === 1) setLoading(true);
      else setLoadingMore(true);

      try {
        const res = await erpFetchJson<NotificationsListResponse>(
          `notifications?${buildQuery(nextPage)}`,
        );
        setItems((prev) =>
          append ? [...prev, ...res.data] : res.data,
        );
        setPage(nextPage);
        setHasMore(nextPage < res.meta.totalPages);
      } catch {
        if (!append) setItems([]);
        setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [buildQuery],
  );

  const refresh = useCallback(async () => {
    await Promise.all([fetchUnreadCount(), fetchPage(1, false)]);
  }, [fetchUnreadCount, fetchPage]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    void fetchPage(page + 1, true);
  }, [fetchPage, hasMore, loadingMore, page]);

  const markRead = useCallback(async (id: string) => {
    await erpFetchJson(`notifications/${id}/read`, { method: 'PATCH' });
    setItems((prev) =>
      prev.map((row) =>
        row.id === id ? { ...row, read: true, readAt: new Date().toISOString() } : row,
      ),
    );
    setUnreadCount((count) => Math.max(0, count - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await erpFetchJson('notifications/read-all', { method: 'PATCH' });
    setItems((prev) =>
      prev.map((row) => ({
        ...row,
        read: true,
        readAt: row.readAt ?? new Date().toISOString(),
      })),
    );
    setUnreadCount(0);
  }, []);

  const deleteOne = useCallback(async (id: string) => {
    await erpFetchJson(`notifications/${id}`, { method: 'DELETE' });
    setItems((prev) => {
      const target = prev.find((row) => row.id === id);
      if (target && !target.read) {
        setUnreadCount((count) => Math.max(0, count - 1));
      }
      return prev.filter((row) => row.id !== id);
    });
  }, []);

  const clearRead = useCallback(async () => {
    await erpFetchJson('notifications', { method: 'DELETE' });
    setItems((prev) => prev.filter((row) => !row.read));
  }, []);

  const snooze = useCallback(async (id: string, duration: SnoozeDuration) => {
    await erpFetchJson(`notifications/${id}/snooze`, {
      method: 'PATCH',
      body: JSON.stringify({ duration }),
    });
    setItems((prev) => {
      const target = prev.find((row) => row.id === id);
      if (target && !target.read) {
        setUnreadCount((count) => Math.max(0, count - 1));
      }
      return prev.filter((row) => row.id !== id);
    });
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current !== null) return;
    pollRef.current = window.setInterval(() => {
      void fetchUnreadCount();
    }, POLL_MS);
  }, [fetchUnreadCount]);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const connectSse = useCallback(() => {
    if (eventSourceRef.current || typeof window === 'undefined') return;

    const source = new EventSource('/api/notifications/stream');
    eventSourceRef.current = source;

    source.addEventListener('open', () => {
      sseConnectedRef.current = true;
      stopPolling();
    });

    source.addEventListener('notification', (event) => {
      try {
        const payload = JSON.parse(event.data) as NotificationDto;
        setItems((prev) => {
          if (prev.some((row) => row.id === payload.id)) return prev;
          return [payload, ...prev];
        });
      } catch {
        /* ignore */
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
      sseConnectedRef.current = false;
      source.close();
      eventSourceRef.current = null;
      startPolling();
    };
  }, [startPolling, stopPolling]);

  useEffect(() => {
    if (!enabled) return;
    void fetchUnreadCount();
    connectSse();
    if (!sseConnectedRef.current) startPolling();

    return () => {
      stopPolling();
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [connectSse, enabled, fetchUnreadCount, startPolling, stopPolling]);

  useEffect(() => {
    if (!enabled) return;
    void fetchPage(1, false);
  }, [enabled, tab, fetchPage]);

  return {
    unreadCount,
    items,
    tab,
    setTab,
    loading,
    loadingMore,
    hasMore,
    refresh,
    loadMore,
    markRead,
    markAllRead,
    deleteOne,
    clearRead,
    snooze,
  };
}
