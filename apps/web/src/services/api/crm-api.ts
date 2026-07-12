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

export type CrmMotivoPerdaDto = {
  id: string;
  name: string;
  order: number;
  requiresText: boolean;
};

export type CrmUserDto = {
  id: string;
  name: string;
  email: string;
};

export type CrmMetasMesDto = {
  mes: number;
  ano: number;
  metaLeads: number;
  metaFechamentos: number;
  metaValor: number;
  atualLeads: number;
  atualFechamentos: number;
  atualValor: number;
  progressoLeads: number;
  progressoFechamentos: number;
  progressoValor: number;
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
  lastTouchpointAt?: string;
  responsavelId?: string | null;
  responsavel?: CrmUserDto | null;
  score?: number;
  motivoPerdaId?: string | null;
  motivoPerdaTexto?: string | null;
  motivoPerdaMeta?: CrmMotivoPerdaDto;
};

export type CrmDashboardPeriod = '7d' | '30d' | '90d' | 'all';

export type CrmDashboardDto = {
  filter: string;
  period: CrmDashboardPeriod;
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
    leadsSemContato: number;
  };
  porOrigem: Array<{
    origin: CrmCardOrigin;
    leads: number;
    orcamentos: number;
    fechados: number;
    taxaLeadFechado: number;
    ticketMedio: number;
    cicloMedioDias: number;
    touchpointsMedios: number;
  }>;
  metasMes?: CrmMetasMesDto;
  motivosPerdaDistribuicao?: Array<{
    motivoId: string;
    motivoName: string;
    count: number;
  }>;
};

export type CrmTouchpointInput = {
  number: number;
  done: boolean;
  date?: string | null;
  channel?: string | null;
};

export type CrmRelatoriosDto = {
  startDate: string;
  endDate: string;
  origin: CrmCardOrigin | 'TODOS';
  bucketMode: 'week' | 'month';
  resumo: {
    totalLeads: number;
    fechados: number;
    perdidos: number;
    emNegociacao: number;
    valorTotalFechado: number;
    ticketMedio: number;
    taxaConversaoGeral: number;
  };
  leadsFechados: Array<{
    id: string;
    name: string;
    origin: CrmCardOrigin;
    canalEntrada: string | null;
    valor: number;
    touchpoints: number;
    cicloVendasDias: number;
    dataFechamento: string;
  }>;
  performancePorOrigem: Array<{
    origin: CrmCardOrigin;
    leads: number;
    fechados: number;
    taxaConversao: number;
    ticketMedio: number;
    cicloMedioDias: number;
    touchpointsMedios: number;
  }>;
  funilConversao: Array<{
    statusId: string;
    statusName: string;
    order: number;
    count: number;
    dropPercent: number | null;
  }>;
  evolucaoTemporal: Array<{
    period: string;
    periodStart: string;
    novosLeads: number;
    fechamentos: number;
  }>;
  motivosPerdaDistribuicao?: Array<{
    motivoId: string;
    motivoName: string;
    count: number;
  }>;
};

export type CrmImportLeadInput = {
  nome: string;
  telefone?: string | null;
  email?: string | null;
  origem: CrmCardOrigin;
  valor?: number | null;
  observacoes?: string | null;
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

export async function listCrmMotivosPerda() {
  return erpFetchJson<CrmMotivoPerdaDto[]>(`${BASE}/motivos-perda`);
}

export async function createCrmMotivoPerda(body: {
  name: string;
  order?: number;
  requiresText?: boolean;
}) {
  return erpFetchJson<CrmMotivoPerdaDto>(`${BASE}/motivos-perda`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteCrmMotivoPerda(id: string) {
  return erpFetchJson<{ ok: boolean }>(`${BASE}/motivos-perda/${id}`, {
    method: 'DELETE',
  });
}

export async function checkCrmDuplicate(params: {
  phone?: string;
  email?: string;
  excludeId?: string;
}) {
  const qs = new URLSearchParams();
  if (params.phone?.trim()) qs.set('phone', params.phone.trim());
  if (params.email?.trim()) qs.set('email', params.email.trim());
  if (params.excludeId) qs.set('excludeId', params.excludeId);
  return erpFetchJson<{
    duplicate: boolean;
    existing?: CrmCardDto;
  }>(`${BASE}/cards/check-duplicate?${qs.toString()}`);
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
  force?: boolean;
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
    responsavelId?: string | null;
    motivoPerdaId?: string | null;
    motivoPerdaTexto?: string | null;
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

export async function getCrmRelatorios(params: {
  startDate: string;
  endDate: string;
  origin?: CrmCardOrigin | 'TODOS';
}) {
  const qs = new URLSearchParams();
  qs.set('startDate', params.startDate);
  qs.set('endDate', params.endDate);
  if (params.origin && params.origin !== 'TODOS') {
    qs.set('origin', params.origin);
  }
  return erpFetchJson<CrmRelatoriosDto>(`${BASE}/relatorios?${qs.toString()}`);
}

export async function getCrmDashboard(
  origin?: CrmCardOrigin | 'TODOS',
  period: CrmDashboardPeriod = 'all',
) {
  const params = new URLSearchParams();
  if (origin && origin !== 'TODOS') params.set('origin', origin);
  if (period !== 'all') params.set('period', period);
  const qs = params.toString();
  return erpFetchJson<CrmDashboardDto>(
    `${BASE}/dashboard${qs ? `?${qs}` : ''}`,
  );
}

export async function listCrmUsuarios() {
  return erpFetchJson<CrmUserDto[]>(`${BASE}/usuarios`);
}

export async function upsertCrmMeta(body: {
  mes: number;
  ano: number;
  metaLeads: number;
  metaFechamentos: number;
  metaValor: number;
}) {
  return erpFetchJson<CrmMetasMesDto>(`${BASE}/metas`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function importCrmLeads(leads: CrmImportLeadInput[]) {
  return erpFetchJson<{ imported: number; cards: CrmCardDto[] }>(
    `${BASE}/importar`,
    {
      method: 'POST',
      body: JSON.stringify({ leads }),
    },
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
  ANUNCIO: 'border-blue-400/60 bg-blue-500/30 text-blue-100',
  INDICACAO: 'border-emerald-400/60 bg-emerald-500/30 text-emerald-100',
  FRIO: 'border-violet-400/60 bg-violet-500/25 text-violet-100',
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

