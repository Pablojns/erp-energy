import type { CSSProperties } from 'react';
import type { OrderWorkflowStatusColor } from '@/src/components/expedicao/shared/order-helpers';
import type { OrderStatus, StatusFilterId } from '@/src/components/expedicao/shared/types';

type BadgeTone = {
  base: string;
  text: string;
};

const BADGE_TONES: Partial<Record<StatusFilterId, BadgeTone>> = {
  novo: { base: '#2563eb', text: '#1d4ed8' },
  em_separacao: { base: '#2563eb', text: '#1d4ed8' },
  aguardando_nf: { base: '#ea580c', text: '#c2410c' },
  finalizado: { base: '#16a34a', text: '#15803d' },
  parcial: { base: '#ca8a04', text: '#a16207' },
  cancelado: { base: '#dc2626', text: '#b91c1c' },
  urgente: { base: '#dc2626', text: '#b91c1c' },
};

const WORKFLOW_TO_TONE: Record<OrderWorkflowStatusColor, BadgeTone> = {
  novo: BADGE_TONES.novo!,
  em_separacao: BADGE_TONES.em_separacao!,
  aguardando_nf: BADGE_TONES.aguardando_nf!,
  finalizado: BADGE_TONES.finalizado!,
  parcial: BADGE_TONES.parcial!,
  cancelado: BADGE_TONES.cancelado!,
};

/** Cores fixas de badge — mantidas para referência semântica. */
export const PEDIDOS_STATUS_BG: Partial<Record<StatusFilterId, string>> = {
  novo: '#2563eb',
  em_separacao: '#2563eb',
  aguardando_nf: '#ea580c',
  finalizado: '#16a34a',
  parcial: '#ca8a04',
  cancelado: '#dc2626',
  urgente: '#dc2626',
};

function gradientBadgeStyle(tone: BadgeTone, active = false): CSSProperties {
  const { base, text } = tone;
  return {
    background: `linear-gradient(135deg, ${base}20, ${base}35)`,
    color: text,
    border: `1px solid ${base}50`,
    ...(active
      ? {
          boxShadow: `0 0 0 2px var(--bg-card), 0 0 0 3px ${base}30`,
        }
      : {}),
  };
}

export function pedidosStatusBadgeStyle(
  tone: StatusFilterId | string | undefined,
  active = false,
): CSSProperties | undefined {
  const badgeTone = BADGE_TONES[tone as StatusFilterId];
  if (!badgeTone) return undefined;
  return gradientBadgeStyle(badgeTone, active);
}

export const URGENT_BADGE_STYLE: CSSProperties = gradientBadgeStyle(BADGE_TONES.urgente!);

export const MANUAL_URGENT_BADGE_STYLE: CSSProperties = gradientBadgeStyle({
  base: '#ea580c',
  text: '#c2410c',
});

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
  return gradientBadgeStyle(WORKFLOW_TO_TONE[color], active);
}
