import { Prisma } from '@erp/database';

export type CrmPropostaItemCalcInput = {
  quantidade: number;
  valorUnit: number;
  desconto?: number | null;
};

export function calcItemTotal(input: CrmPropostaItemCalcInput): number {
  const qty = Math.max(0, input.quantidade);
  const unit = Math.max(0, Number(input.valorUnit) || 0);
  const discountPct = Math.min(100, Math.max(0, Number(input.desconto) || 0));
  const gross = qty * unit;
  return Math.round(gross * (1 - discountPct / 100) * 100) / 100;
}

export function calcPropostaTotal(
  itens: CrmPropostaItemCalcInput[],
  descontoGeralPct?: number | null,
): { subtotal: number; total: number } {
  const subtotal = itens.reduce((acc, item) => acc + calcItemTotal(item), 0);
  const discountPct = Math.min(
    100,
    Math.max(0, Number(descontoGeralPct) || 0),
  );
  const total = Math.round(subtotal * (1 - discountPct / 100) * 100) / 100;
  return { subtotal, total };
}

export function decimalFromNumber(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

export function formatBrl(value: number | Prisma.Decimal | string | null): string {
  const num = Number(value ?? 0);
  return num.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function formatPtDate(value: Date | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value);
}

export const CRM_PROPOSTA_STATUSES = [
  'RASCUNHO',
  'ENVIADA',
  'ACEITA',
  'RECUSADA',
  'VENCIDA',
] as const;

export type CrmPropostaStatus = (typeof CRM_PROPOSTA_STATUSES)[number];

export function isCrmPropostaStatus(value: string): value is CrmPropostaStatus {
  return (CRM_PROPOSTA_STATUSES as readonly string[]).includes(value);
}
