export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type DigestItemDto = {
  entityId: string;
  entityType: string;
  label: string;
  link?: string | null;
};

export type NotificationDto = {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  message: string;
  link: string | null;
  entityId: string | null;
  entityType: string | null;
  read: boolean;
  readAt: string | null;
  priority: NotificationPriority;
  snoozedUntil: string | null;
  digestCount: number;
  digestItems: DigestItemDto[];
  isDigest: boolean;
  primarySentAt: string | null;
  escalatedToAdmin: boolean;
  createdAt: string;
};

export type NotificationConfigDto = {
  criticalStockThreshold: number;
  orderDelayedDays: number;
  leadFollowupDays: number;
  nfPendingHours: number;
};

export type SnoozeDuration = '1h' | '2h' | '4h' | 'tomorrow';

export type NotificationsListResponse = {
  data: NotificationDto[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type NotificationTab = 'all' | 'unread' | 'urgent';

export const NOTIFICATION_TYPE_META: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  ORDER_DELAYED: { label: 'Expedição', color: '#dc2626', bg: '#fef2f2' },
  NF_PENDING: { label: 'NF', color: '#ea580c', bg: '#fff7ed' },
  ORDER_URGENT: { label: 'Urgente', color: '#dc2626', bg: '#fef2f2' },
  STOCK_LOW: { label: 'Estoque', color: '#ea580c', bg: '#fff7ed' },
  STOCK_OUT: { label: 'Estoque', color: '#dc2626', bg: '#fef2f2' },
  PURCHASE_RECEIVED: { label: 'Compras', color: '#2563eb', bg: '#eff6ff' },
  PURCHASE_OVERDUE: { label: 'Compras', color: '#ea580c', bg: '#fff7ed' },
  CRM_FOLLOWUP: { label: 'CRM', color: '#2563eb', bg: '#eff6ff' },
  CRM_PROPOSAL_EXPIRING: { label: 'CRM', color: '#ea580c', bg: '#fff7ed' },
  CRM_LEAD_ASSIGNED: { label: 'CRM', color: '#2563eb', bg: '#eff6ff' },
  MENTION: { label: 'Menção', color: '#7c3aed', bg: '#f5f3ff' },
  SYSTEM: { label: 'Sistema', color: '#64748b', bg: '#f8fafc' },
  DAILY_DIGEST: { label: 'Resumo', color: '#f59e0b', bg: '#fffbeb' },
};

export function resolveNotificationHref(
  link: string | null | undefined,
  entityType?: string | null,
  entityId?: string | null,
): string | null {
  if (link?.startsWith('/')) return link;
  if (link?.startsWith('order:') || entityType === 'order') {
    return '/app/expedicao/pedidos';
  }
  if (link?.startsWith('product:') || entityType === 'product') {
    return '/app/estoque';
  }
  if (link?.startsWith('crm:card:') || entityType === 'crm_card') {
    return '/app/crm';
  }
  if (link?.startsWith('purchase:') || entityType === 'purchase') {
    return '/app/compras';
  }
  if (link?.startsWith('financeiro:')) return '/app/financeiro';
  return link ?? null;
}

export function notificationIconTone(
  priority: NotificationPriority,
  type: string,
): { color: string; bg: string } {
  if (priority === 'URGENT') {
    return { color: '#dc2626', bg: 'rgba(220,38,38,0.12)' };
  }
  if (priority === 'HIGH') {
    return { color: '#ea580c', bg: 'rgba(234,88,12,0.12)' };
  }
  const meta = NOTIFICATION_TYPE_META[type];
  if (meta) return { color: meta.color, bg: meta.bg };
  return { color: '#2563eb', bg: 'rgba(37,99,235,0.12)' };
}

export function groupNotificationsByDate(
  items: NotificationDto[],
): { label: string; items: NotificationDto[] }[] {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  const buckets: Record<string, NotificationDto[]> = {
    Hoje: [],
    Ontem: [],
    'Esta semana': [],
    Anteriores: [],
  };

  for (const item of items) {
    const created = new Date(item.createdAt);
    if (created >= startOfToday) {
      buckets.Hoje.push(item);
    } else if (created >= startOfYesterday) {
      buckets.Ontem.push(item);
    } else if (created >= startOfWeek) {
      buckets['Esta semana'].push(item);
    } else {
      buckets.Anteriores.push(item);
    }
  }

  return Object.entries(buckets)
    .filter(([, rows]) => rows.length > 0)
    .map(([label, rows]) => ({ label, items: rows }));
}
