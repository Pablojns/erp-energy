import {
  CORREIOS_SERVICES,
  type CorreiosServiceId,
  type CorreiosDeclaracaoItem,
  parseCorreiosTrackingEvents,
} from '@/src/services/api/correios-api';

export type TabId = 'cotacao' | 'rastreamento' | 'pedidos' | 'etiqueta';

export type TrackedOrderRow = {
  id: string;
  numero: string;
  receiverName: string;
  carrierName: string;
  trackingCode: string;
  lastStatus: string;
};

export const DEFAULT_CEP_ORIGEM = '86057-170';

export const COTACAO_SERVICES = CORREIOS_SERVICES.filter(
  (item) => item.id === 'PAC' || item.id === 'SEDEX',
);

export const ETIQUETA_SERVICES = COTACAO_SERVICES;

export function formatCepDisplay(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function formatEtiquetaDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR');
}

export function formatCepInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function latestTrackingDescription(data: unknown): string {
  const eventos = parseCorreiosTrackingEvents(data);
  return eventos[0]?.descricao ?? 'Sem eventos';
}

export function normalizeTrackingCode(codigo: string): string {
  return codigo.replace(/\s/g, '').toUpperCase();
}

export function extractTrackingObjetos(data: unknown): unknown[] {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data)) return data;
  const root = data as Record<string, unknown>;
  if (Array.isArray(root.objetos)) return root.objetos;
  if (Array.isArray(root.items)) return root.items;
  if (Array.isArray(root.content)) return root.content;
  if (root.codObjeto || root.codigo || root.eventos) return [root];
  return [];
}

export function isTrackingStatusEntregue(status: string): boolean {
  return status.toLowerCase().includes('entregue');
}

export function emptyDeclaracaoItem(): CorreiosDeclaracaoItem {
  return { conteudo: '', quantidade: '1', custoUnitario: '', valor: '' };
}

function parseDeclaracaoNumber(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function formatDeclaracaoValor(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

/** Recalcula Valor Declarado = Quantidade × Custo Unitário. */
export function withAutoValorDeclarado(
  item: CorreiosDeclaracaoItem,
  patch: Partial<Pick<CorreiosDeclaracaoItem, 'quantidade' | 'custoUnitario'>>,
): CorreiosDeclaracaoItem {
  const next = { ...item, ...patch };
  const qty = parseDeclaracaoNumber(next.quantidade);
  const unit = parseDeclaracaoNumber(next.custoUnitario);
  if (qty != null && unit != null && qty >= 0 && unit >= 0) {
    next.valor = formatDeclaracaoValor(qty * unit);
  }
  return next;
}

export function servicoIdFromLabel(servico: string): CorreiosServiceId {
  const normalized = servico.trim().toUpperCase();
  if (normalized.includes('SEDEX')) return 'SEDEX';
  if (normalized.includes('MINI')) return 'MINI';
  return 'PAC';
}

export function extractCodigoRastreio(prePostagem: Record<string, unknown>): string {
  const candidates = [
    prePostagem.codigoObjeto,
    prePostagem.codigoRastreio,
    prePostagem.codigo,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return '';
}
