import {
  Box,
  CheckCircle2,
  Clock,
  FileText,
  Flame,
  Package,
  type LucideIcon,
} from 'lucide-react';
import type { OrderDto, OrderItemDto } from '@/src/components/expedicao/shared/types';

export function getOverdueDays(order: OrderDto): number | null {
  if (order.status === 'FINALIZADO' || order.status === 'CANCELADO') {
    return null;
  }
  if (!order.requestedDeliveryDate) return null;
  const due = new Date(order.requestedDeliveryDate);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diff = Math.floor(
    (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24),
  );
  return diff > 0 ? diff : null;
}

export function isOrderOverdue(order: OrderDto): boolean {
  return getOverdueDays(order) !== null;
}

/** Rótulo visual de atraso: 1 dia, 2 dias, 3+ dias. */
export function formatOverdueLabel(days: number): string {
  if (days >= 3) return 'Atrasado 3+ dias';
  if (days === 2) return 'Atrasado 2 dias';
  if (days === 1) return 'Atrasado 1 dia';
  return `Atrasado ${days} dias`;
}

export function formatOrderQueueTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${date} · ${time}`;
}

/** Data do pedido (sem hora) para cards da fila. */
export function formatOrderQueueDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export type ItemReceiptStatusTone = 'recebido' | 'em_falta' | 'unknown';

/** Badge visual do status da linha na planilha WEG (Recebido / Em falta). */
export function getItemReceiptStatusVisual(status: string | null | undefined): {
  label: string;
  tone: ItemReceiptStatusTone;
} {
  const raw = (status ?? '').trim();
  if (!raw) return { label: '—', tone: 'unknown' };

  const normalized = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (normalized === 'ok' || normalized.includes('recebido')) {
    return {
      label: normalized === 'ok' ? 'OK' : 'Recebido',
      tone: 'recebido',
    };
  }
  if (normalized.includes('falta')) {
    return { label: 'Em falta', tone: 'em_falta' };
  }

  return { label: raw, tone: 'unknown' };
}

/** Item já recebido na planilha WEG (OK / Recebido) — não entra no novo lote de separação. */
export function isWegItemAlreadyReceived(item: {
  mercadoEletronicoItemStatus?: string | null;
}): boolean {
  return getItemReceiptStatusVisual(item.mercadoEletronicoItemStatus).tone === 'recebido';
}

export function summarizeItemReceiptStatus(items: OrderItemDto[]): {
  recebidos: number;
  emFalta: number;
  total: number;
} {
  let recebidos = 0;
  let emFalta = 0;
  for (const item of items) {
    const tone = getItemReceiptStatusVisual(item.mercadoEletronicoItemStatus).tone;
    if (tone === 'recebido') recebidos += 1;
    else if (tone === 'em_falta') emFalta += 1;
  }
  return { recebidos, emFalta, total: items.length };
}

export function resolveItemReceiptStatusForOrder(
  item: OrderItemDto,
  orderStatus: string,
): string | null | undefined {
  const raw = item.mercadoEletronicoItemStatus?.trim();
  if (raw) return raw;

  if (orderStatus === 'FINALIZADO' || orderStatus === 'EXPEDIDO') {
    const qty = item.quantity ?? 0;
    const shipped = Math.max(item.pickedQty ?? 0, item.invoicedQty ?? 0);
    if (qty > 0 && shipped >= qty) return 'OK';
  }

  return null;
}

export function getItemSeparationStatus(item: OrderItemDto): {
  label: string;
  tone: 'complete' | 'partial' | 'pending' | 'nostock';
} {
  const picked = item.pickedQty ?? 0;
  const qty = item.quantity;
  const missing = item.missingQty ?? 0;
  if (picked >= qty && qty > 0) {
    return { label: 'Completo', tone: 'complete' };
  }
  if (item.stockStatus === 'SEM_ESTOQUE' || missing >= qty) {
    return { label: 'Sem estoque', tone: 'nostock' };
  }
  if (picked > 0) {
    return { label: 'Parcial', tone: 'partial' };
  }
  return { label: 'Pendente', tone: 'pending' };
}

export function displayOrDash(value: string | null | undefined): string {
  const v = value?.trim();
  return v ? v : '—';
}

export type QueueBadgeTone =
  | 'urgent'
  | 'stock'
  | 'quote'
  | 'nf'
  | 'ready'
  | 'partial'
  | 'cancelled'
  | 'finished'
  | 'separating'
  | 'late';

export function getQueueCardVisual(order: OrderDto): {
  icon: LucideIcon;
  tone: 'urgent' | 'late' | 'wait' | 'ready' | 'nf' | 'ship' | 'default';
  badgeTone: QueueBadgeTone;
  badgeLabel: string;
} {
  if (order.status === 'CANCELADO') {
    return {
      icon: Clock,
      tone: 'default',
      badgeTone: 'cancelled',
      badgeLabel: 'CANCELADO',
    };
  }
  if (order.status === 'FINALIZADO' || order.status === 'EXPEDIDO') {
    return {
      icon: CheckCircle2,
      tone: 'ready',
      badgeTone: 'finished',
      badgeLabel: 'FINALIZADO',
    };
  }
  if (order.priority <= 2) {
    return {
      icon: Flame,
      tone: 'urgent',
      badgeTone: 'urgent',
      badgeLabel: 'URGENTE',
    };
  }
  if (isOrderOverdue(order)) {
    return {
      icon: Clock,
      tone: 'late',
      badgeTone: 'late',
      badgeLabel: 'ATRASADO',
    };
  }
  if ((order.unidadesFaltantes ?? 0) > 0) {
    return {
      icon: Box,
      tone: 'wait',
      badgeTone: 'stock',
      badgeLabel: 'AG. ESTOQUE',
    };
  }
  if (order.status === 'NOVO' || order.status === 'ANALISADO') {
    return {
      icon: Clock,
      tone: 'wait',
      badgeTone: 'quote',
      badgeLabel: 'NOVO',
    };
  }
  if (order.status === 'RESERVADO') {
    return {
      icon: CheckCircle2,
      tone: 'ready',
      badgeTone: 'ready',
      badgeLabel: 'PRONTO P/ SEPARAÇÃO',
    };
  }
  if (order.status === 'AGUARDANDO_NF' || order.status === 'NF_ATRELADA') {
    return {
      icon: FileText,
      tone: 'nf',
      badgeTone: 'nf',
      badgeLabel: 'AG. NF',
    };
  }
  if (order.status === 'EM_SEPARACAO' || order.status === 'SEPARADO') {
    return {
      icon: Package,
      tone: 'ship',
      badgeTone: 'separating',
      badgeLabel: 'EM SEPARAÇÃO',
    };
  }
  if (order.status === 'PARCIAL') {
    return {
      icon: Box,
      tone: 'wait',
      badgeTone: 'partial',
      badgeLabel: 'PARCIAL',
    };
  }
  return {
    icon: Package,
    tone: 'default',
    badgeTone: 'separating',
    badgeLabel: 'EM SEPARAÇÃO',
  };
}

export function orderDisplayNumber(order: OrderDto): string {
  return order.externalOrderNumber ?? order.code;
}

export function getOrderSendState(order: OrderDto): 'none' | 'partial' | 'complete' {
  const items = order.items ?? [];
  if (items.length === 0) return 'none';
  let completeCount = 0;
  let anyPicked = false;
  for (const item of items) {
    const picked = item.pickedQty ?? 0;
    if (picked > 0) {
      anyPicked = true;
    }
    if (picked >= item.quantity && item.quantity > 0) {
      completeCount += 1;
    }
  }
  if (completeCount === items.length) return 'complete';
  if (anyPicked) return 'partial';
  return 'none';
}

/** Pedido com lote parcial ou itens ainda não enviados na separação. */
export function orderMatchesParcialFilter(order: OrderDto): boolean {
  if (order.status === 'PARCIAL') return true;
  return getOrderSendState(order) === 'partial';
}

export type OrderWorkflowStatusColor =
  | 'novo'
  | 'em_separacao'
  | 'aguardando_nf'
  | 'finalizado'
  | 'parcial'
  | 'cancelado';

/** Badge de workflow (Novo, Em Separação, etc.) com cor padronizada. */
export function resolveOrderWorkflowStatusBadge(order: OrderDto): {
  label: string;
  color: OrderWorkflowStatusColor;
} {
  if (order.status === 'CANCELADO') {
    return { label: 'CANCELADO', color: 'cancelado' };
  }
  if (order.status === 'FINALIZADO' || order.status === 'EXPEDIDO') {
    return { label: 'FINALIZADO', color: 'finalizado' };
  }
  if (order.status === 'PARCIAL') {
    return { label: 'PARCIAL', color: 'parcial' };
  }
  if (
    order.status === 'AGUARDANDO_NF' ||
    order.status === 'NF_ATRELADA' ||
    order.status === 'SEPARADO'
  ) {
    if (getOrderSendState(order) === 'partial') {
      return { label: 'PARCIAL', color: 'parcial' };
    }
    return { label: 'AGUARDANDO NF', color: 'aguardando_nf' };
  }
  if (order.status === 'EM_SEPARACAO') {
    return { label: 'EM SEPARAÇÃO', color: 'em_separacao' };
  }
  if (
    order.status === 'NOVO' ||
    order.status === 'ANALISADO' ||
    order.status === 'RESERVADO' ||
    order.status === 'PENDENTE'
  ) {
    return { label: 'NOVO', color: 'novo' };
  }
  const send = getOrderSendState(order);
  if (send === 'partial') return { label: 'PARCIAL', color: 'parcial' };
  return { label: 'NOVO', color: 'novo' };
}

/** Badge de status exibido nos cards da fila de pedidos. */
export function getOrderQueueCardStatusBadge(order: OrderDto): {
  label: string;
  color: OrderWorkflowStatusColor;
} {
  return resolveOrderWorkflowStatusBadge(order);
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  NOVO: 'Novo',
  ANALISADO: 'Novo',
  PARCIAL: 'Parcial',
  RESERVADO: 'Reservado',
  EM_SEPARACAO: 'Em Separação',
  SEPARADO: 'Separado',
  AGUARDANDO_NF: 'Aguardando NF',
  NF_ATRELADA: 'NF atrelada',
  EXPEDIDO: 'Expedido',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
};

export function formatOrderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}
