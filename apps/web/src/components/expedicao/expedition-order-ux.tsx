'use client';

import type { ReactNode } from 'react';
import { STATUS_META } from '@/src/components/expedicao/expedition-wms-layout';

export type ExpeditionOrderStatus =
  | 'NOVO'
  | 'ANALISADO'
  | 'PARCIAL'
  | 'RESERVADO'
  | 'EM_SEPARACAO'
  | 'SEPARADO'
  | 'AGUARDANDO_NF'
  | 'NF_ATRELADA'
  | 'EXPEDIDO'
  | 'FINALIZADO'
  | 'CANCELADO';

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'erp-glow-badge--neutral',
  success: 'erp-glow-badge--success',
  warning: 'erp-glow-badge--warning',
  danger: 'erp-glow-badge--danger',
  info: 'erp-glow-badge--info',
  accent: 'erp-glow-badge--accent',
};

export function ExpeditionGlowBadge(props: {
  label: string;
  tone?: BadgeTone;
  size?: 'sm' | 'lg';
}) {
  const { label, tone = 'neutral', size = 'sm' } = props;

  return (
    <span
      className={`erp-glow-badge ring-1 ring-inset backdrop-blur-sm ${size === 'lg' ? 'erp-glow-badge--lg' : 'erp-glow-badge--sm'} ${TONE_CLASS[tone]}`}
    >
      {label}
    </span>
  );
}

export type ExpeditionOrderBadgeInput = {
  status: ExpeditionOrderStatus;
  priority: number;
  unidadesFaltantes?: number;
  missingSkuForReserve?: boolean;
  stockReserveBlocked?: boolean;
};

export function buildExpeditionOrderBadges(
  order: ExpeditionOrderBadgeInput,
): Array<{ key: string; label: string; tone: BadgeTone }> {
  const badges: Array<{ key: string; label: string; tone: BadgeTone }> = [];
  const sm = STATUS_META[order.status];

  if (order.priority <= 2) {
    badges.push({ key: 'urgent', label: 'Urgente', tone: 'warning' });
  }
  if (order.status === 'PARCIAL') {
    badges.push({ key: 'partial', label: 'Parcial', tone: 'warning' });
  }
  const hasPendency =
    (order.unidadesFaltantes ?? 0) > 0 ||
    order.missingSkuForReserve ||
    order.stockReserveBlocked;
  if (hasPendency) {
    badges.push({ key: 'pendency', label: 'Pendência', tone: 'danger' });
  }

  badges.push({
    key: 'status',
    label: sm.label.toUpperCase(),
    tone: sm.tone,
  });

  return badges;
}

export function ExpeditionDetailSection(props: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const { title, children, className = '' } = props;
  return (
    <section
      className={`erp-surface rounded-2xl p-4 sm:p-5 ${className}`}
    >
      <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-erp-fg-muted">
        {title}
      </h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ExpeditionDetailTile(props: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  const { label, value, mono = false, className = '' } = props;
  return (
    <div
      className={`erp-card rounded-xl px-3 py-3 ${className}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-erp-fg-muted">
        {label}
      </p>
      <p
        className={`mt-1.5 text-[13px] leading-snug text-erp-fg ${mono ? 'font-mono' : 'font-medium'}`}
      >
        {value}
      </p>
    </div>
  );
}

export function displayOrDash(value: string | null | undefined): string {
  const v = value?.trim();
  return v ? v : '—';
}

export type ExpeditionOrderNotesInput = {
  notes: string | null;
  mercadoEletronicoStatus: string | null;
  contaAzulStatus: string | null;
};

export function buildObservationBlocks(order: ExpeditionOrderNotesInput) {
  const general = order.notes?.trim() ?? '';
  const operational = order.contaAzulStatus?.trim() ?? '';
  const weg = order.mercadoEletronicoStatus?.trim() ?? '';
  const internal = '';

  const blocks = [
    { key: 'general', title: 'Observação geral', body: general },
    { key: 'operational', title: 'Observações operacionais', body: operational },
    { key: 'weg', title: 'Observações da WEG', body: weg },
    { key: 'internal', title: 'Notas internas', body: internal },
  ];

  const hasAny = blocks.some((b) => b.body.length > 0);
  return { blocks, hasAny };
}
