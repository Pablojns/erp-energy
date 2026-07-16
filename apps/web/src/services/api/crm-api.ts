import { erpFetchJson } from '@/src/services/api/erp-fetch';

export type CrmCardOrigin = 'ANUNCIO' | 'INDICACAO' | 'FRIO' | 'ORCAMENTO_DIRETO';

export const CRM_CARD_ORIGINS = ['ANUNCIO', 'INDICACAO', 'FRIO', 'ORCAMENTO_DIRETO'] as const;

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

export type CrmPropostaStatus =
  | 'RASCUNHO'
  | 'ENVIADA'
  | 'ACEITA'
  | 'RECUSADA'
  | 'VENCIDA';

export type CrmPropostaItemDto = {
  id: string;
  propostaId: string;
  descricao: string;
  quantidade: number;
  valorUnit: string;
  desconto: string;
  total: string;
};

export type CrmPropostaDto = {
  id: string;
  cardId: string;
  numero: string;
  titulo: string;
  validade: string | null;
  status: CrmPropostaStatus;
  observacoes: string | null;
  desconto: string;
  total: string;
  createdAt: string;
  updatedAt: string;
  itens: CrmPropostaItemDto[];
};

export type CrmPropostaItemInput = {
  descricao: string;
  quantidade: number;
  valorUnit: number;
  desconto: number;
};

export const CRM_PROPOSTA_STATUS_LABEL: Record<CrmPropostaStatus, string> = {
  RASCUNHO: 'Rascunho',
  ENVIADA: 'Enviada',
  ACEITA: 'Aceita',
  RECUSADA: 'Recusada',
  VENCIDA: 'Vencida',
};

export const CRM_PROPOSTA_STATUS_BADGE: Record<CrmPropostaStatus, string> = {
  RASCUNHO: 'border-gray-200 bg-gray-100 text-gray-700',
  ENVIADA: 'border-sky-200 bg-sky-100 text-sky-800',
  ACEITA: 'border-emerald-200 bg-emerald-100 text-emerald-800',
  RECUSADA: 'border-rose-200 bg-rose-100 text-rose-800',
  VENCIDA: 'border-amber-200 bg-amber-100 text-amber-800',
};

export function calcPropostaItemTotal(item: CrmPropostaItemInput): number {
  const gross = Math.max(0, item.quantidade) * Math.max(0, item.valorUnit);
  const pct = Math.min(100, Math.max(0, item.desconto));
  return Math.round(gross * (1 - pct / 100) * 100) / 100;
}

export function calcPropostaGrandTotal(
  itens: CrmPropostaItemInput[],
  descontoGeralPct: number,
): { subtotal: number; total: number } {
  const subtotal = itens.reduce((acc, item) => acc + calcPropostaItemTotal(item), 0);
  const pct = Math.min(100, Math.max(0, descontoGeralPct));
  const total = Math.round(subtotal * (1 - pct / 100) * 100) / 100;
  return { subtotal, total };
}

export async function listCrmPropostas(cardId: string) {
  return erpFetchJson<CrmPropostaDto[]>(`${BASE}/cards/${cardId}/propostas`);
}

export async function createCrmProposta(
  cardId: string,
  body: {
    titulo: string;
    validade?: string;
    observacoes?: string;
    desconto?: number;
    itens: CrmPropostaItemInput[];
  },
) {
  return erpFetchJson<CrmPropostaDto>(`${BASE}/cards/${cardId}/propostas`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateCrmProposta(
  id: string,
  body: Partial<{
    titulo: string;
    validade: string | null;
    observacoes: string | null;
    desconto: number;
    status: CrmPropostaStatus;
    itens: CrmPropostaItemInput[];
  }>,
) {
  return erpFetchJson<CrmPropostaDto>(`${BASE}/propostas/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteCrmProposta(id: string) {
  return erpFetchJson<{ ok: boolean }>(`${BASE}/propostas/${id}`, {
    method: 'DELETE',
  });
}

export async function aceitarCrmProposta(id: string) {
  return erpFetchJson<CrmPropostaDto>(`${BASE}/propostas/${id}/aceitar`, {
    method: 'POST',
  });
}

export async function downloadCrmPropostaPdf(id: string, filename: string) {
  const res = await fetch(`/api/erp/crm/propostas/${id}/pdf`, {
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    let message = `Erro HTTP ${res.status}`;
    try {
      const body = JSON.parse(text) as { message?: string | string[] };
      if (Array.isArray(body.message)) message = body.message.join(' · ');
      else if (body.message) message = body.message;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filename}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
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
  ORCAMENTO_DIRETO: 'Orçamento direto',
};

export const CRM_ORIGIN_BADGE_CLASS: Record<CrmCardOrigin, string> = {
  ANUNCIO: 'border-[#2AACE2]/60 bg-[#2AACE2]/20 text-[#0f172a]',
  INDICACAO: 'border-emerald-200 bg-emerald-100 text-emerald-800',
  FRIO: 'border-violet-200 bg-violet-100 text-violet-800',
  ORCAMENTO_DIRETO: 'border-sky-200 bg-sky-100 text-sky-800',
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

