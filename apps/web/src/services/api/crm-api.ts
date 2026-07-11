import { erpFetchJson } from '@/src/services/api/erp-fetch';

export type CrmCardOrigin = 'ANUNCIO' | 'INDICACAO' | 'FRIO';

export const CRM_CARD_ORIGINS = ['ANUNCIO', 'INDICACAO', 'FRIO'] as const;

export type CrmFunilDto = {
  id: string;
  name: string;
  order: number;
  color: string | null;
  createdAt: string;
};

export type CrmStatusDto = {
  id: string;
  name: string;
  color: string;
  order: number;
};

export type CrmChannelDto = {
  id: string;
  name: string;
  color: string;
};

export type CrmTouchpointDto = {
  id: string;
  cardId: string;
  number: number;
  done: boolean;
  date: string | null;
  channel: string | null;
  createdAt: string;
};

export type CrmCardDto = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  value: string | null;
  origin: CrmCardOrigin;
  touchPoints: number;
  notes: string | null;
  whatsappLog: string | null;
  observations: string | null;
  prospectionDate: string | null;
  contactsToday: number | null;
  convertedToMeeting: number | null;
  funilId: string;
  funil?: CrmFunilDto;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  status: string;
  statusMeta?: CrmStatusDto;
  touchpoints?: CrmTouchpointDto[];
};

export type CrmDashboardDto = {
  filter: string;
  resumo: {
    leads: number;
    orcamentos: number;
    fechados: number;
    valorFechado: number;
    ticketMedio: number;
    taxaLeadOrcamento: number;
    taxaLeadFechado: number;
    taxaOrcamentoFechado: number;
    cicloMedioDias: number;
    touchpointsMedios: number;
  };
  porOrigem: Array<{
    origin: CrmCardOrigin;
    leads: number;
    orcamentos: number;
    fechados: number;
    taxaLeadFechado: number;
    cicloMedioDias: number;
    touchpointsMedios: number;
  }>;
};

export type CrmTouchpointInput = {
  number: number;
  done: boolean;
  date?: string | null;
  channel?: string | null;
};

const BASE = 'api/crm';

export async function listCrmStatuses() {
  return erpFetchJson<CrmStatusDto[]>(`${BASE}/status`);
}

export async function createCrmStatus(body: {
  name: string;
  color?: string;
  order?: number;
}) {
  return erpFetchJson<CrmStatusDto>(`${BASE}/status`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateCrmStatus(
  id: string,
  body: { name?: string; color?: string; order?: number },
) {
  return erpFetchJson<CrmStatusDto>(`${BASE}/status/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteCrmStatus(id: string) {
  return erpFetchJson<{ ok: boolean }>(`${BASE}/status/${id}`, {
    method: 'DELETE',
  });
}

export async function listCrmChannels() {
  return erpFetchJson<CrmChannelDto[]>(`${BASE}/channels`);
}

export async function createCrmChannel(body: { name: string; color?: string }) {
  return erpFetchJson<CrmChannelDto>(`${BASE}/channels`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateCrmChannel(
  id: string,
  body: { name?: string; color?: string },
) {
  return erpFetchJson<CrmChannelDto>(`${BASE}/channels/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteCrmChannel(id: string) {
  return erpFetchJson<{ ok: boolean }>(`${BASE}/channels/${id}`, {
    method: 'DELETE',
  });
}

export async function listCrmFunis() {
  return erpFetchJson<CrmFunilDto[]>(`${BASE}/funis`);
}

export async function createCrmFunil(body: {
  name: string;
  order?: number;
  color?: string | null;
}) {
  return erpFetchJson<CrmFunilDto>(`${BASE}/funis`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateCrmFunil(
  id: string,
  body: { name?: string; order?: number; color?: string | null },
) {
  return erpFetchJson<CrmFunilDto>(`${BASE}/funis/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteCrmFunil(id: string) {
  return erpFetchJson<{ ok: boolean }>(`${BASE}/funis/${id}`, {
    method: 'DELETE',
  });
}

export async function listCrmCards() {
  return erpFetchJson<CrmCardDto[]>(`${BASE}/cards`);
}

export async function getCrmCard(id: string) {
  return erpFetchJson<CrmCardDto>(`${BASE}/cards/${id}`);
}

export async function createCrmCard(body: {
  name: string;
  phone?: string | null;
  email?: string | null;
  value?: number | null;
  origin: CrmCardOrigin;
  touchPoints?: number;
  notes?: string | null;
  whatsappLog?: string | null;
  funilId: string;
}) {
  return erpFetchJson<CrmCardDto>(`${BASE}/cards`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateCrmCard(
  id: string,
  body: Partial<{
    name: string;
    phone: string | null;
    email: string | null;
    value: number | null;
    origin: CrmCardOrigin;
    touchPoints: number;
    notes: string | null;
    whatsappLog: string | null;
    observations: string | null;
    prospectionDate: string | null;
    contactsToday: number | null;
    convertedToMeeting: number | null;
    funilId: string;
    status: string;
  }>,
) {
  return erpFetchJson<CrmCardDto>(`${BASE}/cards/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function upsertCrmTouchpoints(
  id: string,
  touchpoints: CrmTouchpointInput[],
) {
  return erpFetchJson<CrmCardDto>(`${BASE}/cards/${id}/touchpoints`, {
    method: 'POST',
    body: JSON.stringify({ touchpoints }),
  });
}

export async function deleteCrmCard(id: string) {
  return erpFetchJson<{ ok: boolean }>(`${BASE}/cards/${id}`, {
    method: 'DELETE',
  });
}

export async function moveCrmCard(id: string, funilId: string) {
  return erpFetchJson<CrmCardDto>(`${BASE}/cards/${id}/mover`, {
    method: 'PATCH',
    body: JSON.stringify({ funilId }),
  });
}

export async function getCrmDashboard(origin?: CrmCardOrigin | 'TODOS') {
  const params = new URLSearchParams();
  if (origin && origin !== 'TODOS') params.set('origin', origin);
  const qs = params.toString();
  return erpFetchJson<CrmDashboardDto>(
    `${BASE}/dashboard${qs ? `?${qs}` : ''}`,
  );
}

export function formatCrmCurrency(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function findCrmStatusByName(statuses: CrmStatusDto[], name: string) {
  return statuses.find((s) => s.name === name) ?? null;
}

export function calcNegotiationDays(card: Pick<CrmCardDto, 'createdAt' | 'closedAt'>) {
  const start = new Date(card.createdAt).getTime();
  const end = card.closedAt ? new Date(card.closedAt).getTime() : Date.now();
  return Math.max(0, (end - start) / (1000 * 60 * 60 * 24));
}

export const CRM_ORIGIN_LABEL: Record<CrmCardOrigin, string> = {
  ANUNCIO: 'Anúncio',
  INDICACAO: 'Indicação',
  FRIO: 'Frio',
};

export const CRM_ORIGIN_BADGE_CLASS: Record<CrmCardOrigin, string> = {
  ANUNCIO: 'border-blue-400/40 bg-blue-500/15 text-blue-200',
  INDICACAO: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200',
  FRIO: 'border-zinc-500/40 bg-zinc-500/15 text-zinc-300',
};

export function buildEmptyTouchpoints(): CrmTouchpointInput[] {
  return Array.from({ length: 7 }, (_, index) => ({
    number: index + 1,
    done: false,
    date: null,
    channel: null,
  }));
}

export function mergeTouchpoints(existing?: CrmTouchpointDto[]): CrmTouchpointInput[] {
  const base = buildEmptyTouchpoints();
  if (!existing?.length) return base;
  return base.map((tp) => {
    const found = existing.find((row) => row.number === tp.number);
    if (!found) return tp;
    return {
      number: tp.number,
      done: found.done,
      date: found.date ? found.date.slice(0, 10) : null,
      channel: found.channel,
    };
  });
}
