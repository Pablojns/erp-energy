import type { CSSProperties } from 'react';
import type { OrderWorkflowStatusColor } from '@/src/components/expedicao/shared/order-helpers';
import type { OrderStatus, StatusFilterId } from '@/src/components/expedicao/shared/types';

/** Cores fixas de badge — contraste com texto branco em claro/escuro. */
export const PEDIDOS_STATUS_BG: Partial<Record<StatusFilterId, string>> = {
  novo: '#2563eb',
  em_separacao: '#7c3aed',
  aguardando_nf: '#ea580c',
  finalizado: '#16a34a',
  parcial: '#ca8a04',
  cancelado: '#dc2626',
  urgente: '#dc2626',
};

const WORKFLOW_TO_BG: Record<OrderWorkflowStatusColor, string> = {
  novo: PEDIDOS_STATUS_BG.novo!,
  em_separacao: PEDIDOS_STATUS_BG.em_separacao!,
  aguardando_nf: PEDIDOS_STATUS_BG.aguardando_nf!,
  finalizado: PEDIDOS_STATUS_BG.finalizado!,
  parcial: PEDIDOS_STATUS_BG.parcial!,
  cancelado: PEDIDOS_STATUS_BG.cancelado!,
};

export function pedidosStatusBadgeStyle(
  tone: StatusFilterId | string | undefined,
  active = false,
): CSSProperties | undefined {
  const bg = PEDIDOS_STATUS_BG[tone as StatusFilterId];
  if (!bg) return undefined;
  return {
    background: bg,
    color: 'var(--color-text-inverse)',
    border: 'none',
    ...(active
      ? {
          boxShadow:
            '0 0 0 2px var(--bg-card), 0 0 0 4px color-mix(in srgb, var(--bg-card) 35%, transparent)',
        }
      : {}),
  };
}

export const URGENT_BADGE_STYLE: CSSProperties = {
  background: '#dc2626',
  color: 'var(--color-text-inverse)',
};

export const MANUAL_URGENT_BADGE_STYLE: CSSProperties = {
  background: '#ea580c',
  color: '#ffffff',
};

export function orderStatusToWorkflowColor(
  status: OrderStatus,
): OrderWorkflowStatusColor | null {
  switch (status) {
    case 'NOVO':
    case 'ANALISADO':
    case 'RESERVADO':
      return 'novo';
    case 'EM_SEPARACAO':
      return 'em_separacao';
    case 'AGUARDANDO_NF':
    case 'NF_ATRELADA':
    case 'SEPARADO':
      return 'aguardando_nf';
    case 'FINALIZADO':
    case 'EXPEDIDO':
      return 'finalizado';
    case 'PARCIAL':
      return 'parcial';
    case 'CANCELADO':
      return 'cancelado';
    default:
      return null;
  }
}

export function orderStatusDropdownBadgeStyle(
  status: OrderStatus,
  active = false,
): CSSProperties | undefined {
  const color = orderStatusToWorkflowColor(status);
  if (!color) return undefined;
  return orderWorkflowCardBadgeStyle(color, active);
}

export function orderWorkflowCardBadgeStyle(
  color: OrderWorkflowStatusColor,
  active = false,
): CSSProperties {
  return {
    background: WORKFLOW_TO_BG[color],
    color: 'var(--color-text-inverse)',
    border: 'none',
    ...(active
      ? {
          boxShadow:
            '0 0 0 2px var(--bg-card), 0 0 0 4px color-mix(in srgb, var(--bg-card) 35%, transparent)',
        }
      : {}),
  };
}
