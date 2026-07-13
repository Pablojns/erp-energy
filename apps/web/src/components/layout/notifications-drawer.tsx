'use client';

import {
  AlertTriangle,
  AtSign,
  Bell,
  Box,
  ClipboardList,
  Info,
  ShoppingCart,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { formatRelativeTime } from '@/src/components/dashboard/utils';
import { useNotifications } from '@/src/hooks/use-notifications';
import {
  groupNotificationsByDate,
  notificationIconTone,
  resolveNotificationHref,
  type NotificationDto,
  type NotificationTab,
} from '@/src/services/api/notifications-api';

type NotificationsDrawerProps = {
  open: boolean;
  onClose: () => void;
};

const TAB_ITEMS: { id: NotificationTab; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'unread', label: 'Não lidas' },
  { id: 'urgent', label: 'Urgentes' },
];

function NotificationTypeIcon(props: { type: string; className?: string }) {
  const iconClass = props.className ?? 'h-4 w-4';
  switch (props.type) {
    case 'ORDER_DELAYED':
    case 'ORDER_URGENT':
    case 'NF_PENDING':
      return <Truck className={iconClass} aria-hidden />;
    case 'STOCK_LOW':
    case 'STOCK_OUT':
      return <Box className={iconClass} aria-hidden />;
    case 'PURCHASE_RECEIVED':
    case 'PURCHASE_OVERDUE':
      return <ShoppingCart className={iconClass} aria-hidden />;
    case 'CRM_FOLLOWUP':
    case 'CRM_PROPOSAL_EXPIRING':
    case 'CRM_LEAD_ASSIGNED':
      return <Users className={iconClass} aria-hidden />;
    case 'MENTION':
      return <AtSign className={iconClass} aria-hidden />;
    case 'SYSTEM':
      return <Info className={iconClass} aria-hidden />;
    default:
      return <Bell className={iconClass} aria-hidden />;
  }
}

function NotificationRow(props: {
  item: NotificationDto;
  onOpen: (item: NotificationDto) => void;
  onDelete: (id: string) => void;
}) {
  const { item, onOpen, onDelete } = props;
  const tone = notificationIconTone(item.priority, item.type);

  return (
    <div
      className={`erp-notif-row ${!item.read ? 'erp-notif-row--unread' : ''}`}
    >
      <button
        type="button"
        className="erp-notif-row-main"
        onClick={() => onOpen(item)}
      >
        <span
          className="erp-notif-row-icon"
          style={{ color: tone.color, background: tone.bg }}
        >
          {item.priority === 'URGENT' ? (
            <AlertTriangle className="h-4 w-4" aria-hidden />
          ) : (
            <NotificationTypeIcon type={item.type} />
          )}
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="flex items-start justify-between gap-2">
            <span className="text-sm font-semibold text-[var(--erp-fg)]">
              {item.title}
            </span>
            <span className="shrink-0 text-[11px] text-[var(--erp-fg-muted)]">
              {formatRelativeTime(item.createdAt)}
            </span>
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-[var(--erp-fg-muted)]">
            {item.body}
          </span>
        </span>
      </button>
      <button
        type="button"
        className="erp-notif-row-delete"
        aria-label="Remover notificação"
        onClick={() => onDelete(item.id)}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function NotificationsDrawer(props: NotificationsDrawerProps) {
  const { open, onClose } = props;
  const router = useRouter();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const {
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
    unreadCount,
  } = useNotifications({ enabled: open });

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: '120px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, hasMore, loadMore, items.length]);

  const handleOpen = useCallback(
    async (item: NotificationDto) => {
      if (!item.read) {
        try {
          await markRead(item.id);
        } catch {
          /* segue navegação */
        }
      }

      const href = resolveNotificationHref(
        item.link,
        item.entityType,
        item.entityId,
      );
      onClose();
      if (href) router.push(href);
    },
    [markRead, onClose, router],
  );

  const groups = groupNotificationsByDate(items);

  if (!open) return null;

  return (
    <div className="erp-notif-drawer-root" role="presentation">
      <button
        type="button"
        className="erp-notif-drawer-backdrop"
        aria-label="Fechar notificações"
        onClick={onClose}
      />
      <aside
        className="erp-notif-drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Notificações"
      >
        <header className="erp-notif-drawer-header">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-[var(--erp-accent)]" />
            <h2 className="text-base font-semibold text-[var(--erp-fg)]">
              Notificações
            </h2>
            {unreadCount > 0 ? (
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            {unreadCount > 0 ? (
              <button
                type="button"
                className="erp-notif-drawer-action"
                onClick={() => void markAllRead()}
              >
                Marcar todas como lidas
              </button>
            ) : null}
            <button
              type="button"
              className="erp-notif-drawer-action"
              onClick={() => void clearRead()}
            >
              Limpar lidas
            </button>
            <button
              type="button"
              className="erp-notif-drawer-close"
              aria-label="Fechar"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="erp-notif-drawer-tabs">
          {TAB_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`erp-notif-drawer-tab ${
                tab === item.id ? 'erp-notif-drawer-tab--active' : ''
              }`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="erp-notif-drawer-body erp-scrollbar">
          {loading ? (
            <p className="px-4 py-10 text-center text-sm text-[var(--erp-fg-muted)]">
              Carregando…
            </p>
          ) : items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-[var(--erp-fg-muted)]">
              Nenhuma notificação
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.label} className="erp-notif-group">
                <h3 className="erp-notif-group-title">{group.label}</h3>
                <div className="divide-y divide-[var(--erp-border)]">
                  {group.items.map((item) => (
                    <NotificationRow
                      key={item.id}
                      item={item}
                      onOpen={(row) => void handleOpen(row)}
                      onDelete={(id) => void deleteOne(id)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
          {loadingMore ? (
            <p className="px-4 py-4 text-center text-xs text-[var(--erp-fg-muted)]">
              Carregando mais…
            </p>
          ) : null}
          <div ref={sentinelRef} className="h-1" />
        </div>

        <footer className="border-t border-[var(--erp-border)] px-4 py-3">
          <button
            type="button"
            className="text-xs font-semibold text-[var(--erp-accent)]"
            onClick={() => {
              onClose();
              router.push('/app/configuracoes');
            }}
          >
            Preferências de notificações
          </button>
        </footer>
      </aside>
    </div>
  );
}
