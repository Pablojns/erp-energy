'use client';

export type OrderStatus =
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

export const STATUS_META: Record<
  OrderStatus,
  { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }
> = {
  NOVO: { label: 'Novo', tone: 'neutral' },
  ANALISADO: { label: 'Analisado', tone: 'info' },
  PARCIAL: { label: 'Parcial', tone: 'warning' },
  RESERVADO: { label: 'Reservado', tone: 'info' },
  EM_SEPARACAO: { label: 'Em separação', tone: 'info' },
  SEPARADO: { label: 'Separado', tone: 'info' },
  AGUARDANDO_NF: { label: 'Aguardando NF', tone: 'warning' },
  NF_ATRELADA: { label: 'NF atrelada', tone: 'success' },
  EXPEDIDO: { label: 'Expedido', tone: 'success' },
  FINALIZADO: { label: 'Finalizado', tone: 'success' },
  CANCELADO: { label: 'Cancelado', tone: 'danger' },
};

export function formatBrlDisplay(v: string | number) {
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n)) return String(v);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(n);
}

export function formatDayDisplay(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}
