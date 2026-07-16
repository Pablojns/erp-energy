import { erpFetchJson } from '@/src/services/api/erp-fetch';

export const QUOTE_STATUSES = [
  'AGUARDANDO',
  'PENDENTE_APROVACAO',
  'APROVADO',
  'NAO_APROVADO',
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export type QuoteCustomerType = 'PF' | 'PJ';
export type QuoteOrigin = 'SISTEMA' | 'WHATSAPP';

export type QuoteItemDto = {
  id: string;
  quoteId: string;
  sku: string;
  description: string;
  imageUrl: string | null;
  engraving: string | null;
  supplier: string | null;
  requiresArtwork: boolean;
  artworkFileName: string | null;
  artworkMimeType: string | null;
  artworkData: string | null;
  quantity: number;
  unitPrice: string;
  total: string;
  order: number;
};

export type QuoteProposalDto = {
  id: string;
  quoteId: string;
  sentAt: string | null;
  emailSent: boolean;
  createdBy: string | null;
  contactName: string | null;
  contactEmail: string | null;
  total: string;
  createdAt: string;
};

export type QuoteDto = {
  id: string;
  code: string;
  requestDate: string;
  customerOrderRef: string | null;
  billingCompany: string | null;
  status: QuoteStatus | string;
  customerType: QuoteCustomerType | string;
  customerId: string | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  customerDocument: string | null;
  responsibleUserId: string | null;
  origin: QuoteOrigin | string;
  observations: string | null;
  customerNotes: string | null;
  carrierId: string | null;
  deliveryAddress: string | null;
  freightValue: string;
  freightToConsult: boolean;
  deliveryDeadline: string | null;
  freightType: string | null;
  subtotal: string;
  total: string;
  paymentTerms: string | null;
  paymentMethod: string | null;
  linkedCrmCardId: string | null;
  linkedOrderId: string | null;
  createdAt: string;
  updatedAt: string;
  items: QuoteItemDto[];
  proposals: QuoteProposalDto[];
};

export type QuotesListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type QuotesListResponse = {
  data: QuoteDto[];
  meta: QuotesListMeta;
};

export type QuotePayload = {
  requestDate?: string;
  customerOrderRef?: string | null;
  billingCompany?: string | null;
  status?: QuoteStatus;
  customerType: QuoteCustomerType;
  customerId?: string | null;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerDocument?: string | null;
  responsibleUserId?: string | null;
  origin?: QuoteOrigin;
  observations?: string | null;
  customerNotes?: string | null;
  carrierId?: string | null;
  deliveryAddress?: string | null;
  freightValue?: number | null;
  freightToConsult?: boolean;
  deliveryDeadline?: string | null;
  freightType?: string | null;
  paymentTerms?: string | null;
  paymentMethod?: string | null;
  linkedCrmCardId?: string | null;
  linkedOrderId?: string | null;
};

export const QUOTE_STATUS_LABEL: Record<string, string> = {
  AGUARDANDO: 'Aguardando',
  PENDENTE_APROVACAO: 'Pendente',
  APROVADO: 'Aprovado',
  NAO_APROVADO: 'Não Aprovado',
};

export const QUOTE_STATUS_BADGE_CLASS: Record<string, string> = {
  AGUARDANDO: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
  PENDENTE_APROVACAO: 'bg-sky-100 text-sky-800 ring-1 ring-sky-200',
  APROVADO: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
  NAO_APROVADO: 'bg-rose-100 text-rose-800 ring-1 ring-rose-200',
};

export const QUOTE_ORIGIN_LABEL: Record<string, string> = {
  SISTEMA: 'Sistema',
  WHATSAPP: 'WhatsApp',
};

const BASE = 'api/quotes';

export type ListQuotesParams = {
  status?: QuoteStatus;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  linkedCrmCardId?: string;
  page?: number;
  pageSize?: number;
};

export async function listQuotes(params: ListQuotesParams = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.search?.trim()) qs.set('search', params.search.trim());
  if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
  if (params.dateTo) qs.set('dateTo', params.dateTo);
  if (params.linkedCrmCardId) qs.set('linkedCrmCardId', params.linkedCrmCardId);
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  const query = qs.toString();
  return erpFetchJson<QuotesListResponse>(
    `${BASE}${query ? `?${query}` : ''}`,
  );
}

export async function getQuote(id: string) {
  return erpFetchJson<QuoteDto>(`${BASE}/${id}`);
}

export async function createQuote(payload: QuotePayload) {
  return erpFetchJson<QuoteDto>(BASE, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateQuote(id: string, payload: Partial<QuotePayload>) {
  return erpFetchJson<QuoteDto>(`${BASE}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function updateQuoteStatus(id: string, status: QuoteStatus) {
  return erpFetchJson<QuoteDto>(`${BASE}/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function deleteQuote(id: string) {
  return erpFetchJson<{ ok: boolean }>(`${BASE}/${id}`, {
    method: 'DELETE',
  });
}

export type QuoteCatalogProductDto = {
  id: string;
  supplierCode: string;
  compositeCode: string | null;
  friendlyCode: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  siteLink: string | null;
  salePrice: string;
  availableQty: number;
  mainStockQty: number;
  colorMain: string | null;
  colorSecondary: string | null;
  ncm: string | null;
  weight: string;
  height: string;
  width: string;
  depth: string;
  supplier: string;
  active: boolean;
  lastSyncAt: string;
  createdAt: string;
};

export type QuoteCatalogListResponse = {
  data: QuoteCatalogProductDto[];
  meta: QuotesListMeta & {
    hasMore?: boolean;
    lastSyncAt: string | null;
    lastStatus: string | null;
    lastCount: number;
  };
};

export type CatalogSyncResult = {
  ok: boolean;
  skipped: boolean;
  message: string;
  upserted: number;
  lastSyncAt: string | null;
};

export type ListCatalogParams = {
  search?: string;
  active?: boolean;
  page?: number;
  pageSize?: number;
  includeTotal?: boolean;
};

export async function listQuoteCatalog(params: ListCatalogParams = {}) {
  const qs = new URLSearchParams();
  if (params.search?.trim()) qs.set('search', params.search.trim());
  if (params.active !== undefined) qs.set('active', String(params.active));
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  if (params.includeTotal === false) qs.set('includeTotal', 'false');
  const query = qs.toString();
  return erpFetchJson<QuoteCatalogListResponse>(
    `${BASE}/catalog${query ? `?${query}` : ''}`,
  );
}

export async function syncQuoteCatalog() {
  return erpFetchJson<CatalogSyncResult>(`${BASE}/catalog/sync`, {
    method: 'POST',
  });
}

export async function syncSpotQuoteCatalog() {
  return erpFetchJson<CatalogSyncResult>(`${BASE}/catalog/sync-spot`, {
    method: 'POST',
  });
}

export type CreateQuoteItemPayload = {
  catalogProductId?: string;
  sku?: string;
  description?: string;
  imageUrl?: string | null;
  engraving?: string | null;
  supplier?: string | null;
  requiresArtwork?: boolean;
  artworkFileName?: string | null;
  artworkMimeType?: string | null;
  artworkData?: string | null;
  quantity: number;
  unitPrice?: number;
};

export type UpdateQuoteItemPayload = {
  description?: string;
  engraving?: string | null;
  supplier?: string | null;
  requiresArtwork?: boolean;
  artworkFileName?: string | null;
  artworkMimeType?: string | null;
  artworkData?: string | null;
  quantity?: number;
  unitPrice?: number;
};

export async function addQuoteItem(quoteId: string, payload: CreateQuoteItemPayload) {
  return erpFetchJson<QuoteDto>(`${BASE}/${quoteId}/items`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateQuoteItem(
  quoteId: string,
  itemId: string,
  payload: UpdateQuoteItemPayload,
) {
  return erpFetchJson<QuoteDto>(`${BASE}/${quoteId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteQuoteItem(quoteId: string, itemId: string) {
  return erpFetchJson<QuoteDto>(`${BASE}/${quoteId}/items/${itemId}`, {
    method: 'DELETE',
  });
}

export async function listQuoteProposals(quoteId: string) {
  return erpFetchJson<QuoteProposalDto[]>(`${BASE}/${quoteId}/proposals`);
}

async function downloadPdfFromResponse(res: Response, fallbackName: string) {
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
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^"]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return {
    proposalId: res.headers.get('X-Proposal-Id'),
  };
}

export async function createQuoteProposal(
  quoteId: string,
  payload?: {
    contactName?: string | null;
    contactEmail?: string | null;
    validityDays?: number;
  },
) {
  const res = await fetch(`/api/erp/quotes/${quoteId}/proposals`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  return downloadPdfFromResponse(res, `proposta-${quoteId}.pdf`);
}

export async function downloadQuoteProposalPdf(
  quoteId: string,
  proposalId: string,
) {
  const res = await fetch(
    `/api/erp/quotes/${quoteId}/proposals/${proposalId}/pdf`,
    { credentials: 'include' },
  );
  await downloadPdfFromResponse(res, `proposta-${proposalId}.pdf`);
}

export async function sendQuoteProposalEmail(
  quoteId: string,
  proposalId: string,
  payload: { to: string; contactName?: string | null },
) {
  return erpFetchJson<QuoteProposalDto>(
    `${BASE}/${quoteId}/proposals/${proposalId}/send-email`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export type QuoteDashboardPeriod = '7d' | '30d' | '90d' | 'all';

export type QuoteDashboardDto = {
  period: QuoteDashboardPeriod;
  resumo: {
    valorAberto: number;
    ticketMedio: number;
    taxaConversao: number;
    totalOrcamentos: number;
    aprovados: number;
  };
  porVendedor: Array<{
    responsavelId: string | null;
    nome: string;
    quantidade: number;
    valorTotal: number;
    taxaConversao: number;
  }>;
};

export async function getQuotesDashboard(period: QuoteDashboardPeriod = '30d') {
  return erpFetchJson<QuoteDashboardDto>(
    `${BASE}/dashboard?period=${encodeURIComponent(period)}`,
  );
}

export type QuotePersonSource = 'CRM' | 'CADASTRO';

export type QuotePersonSearchResult = {
  id: string;
  source: QuotePersonSource;
  name: string;
  email: string | null;
  phone: string | null;
  document: string | null;
  deliveryAddress: string | null;
  customerId: string | null;
  linkedCrmCardId: string | null;
};

export async function searchQuotePeople(q?: string) {
  const qs = new URLSearchParams();
  if (q?.trim()) qs.set('q', q.trim());
  const query = qs.toString();
  return erpFetchJson<QuotePersonSearchResult[]>(
    `${BASE}/people-search${query ? `?${query}` : ''}`,
  );
}

export async function convertQuoteToOrder(quoteId: string) {
  return erpFetchJson<{
    quote: QuoteDto;
    order: { id: string; code: string };
  }>(`${BASE}/${quoteId}/convert-to-order`, {
    method: 'POST',
  });
}

export function formatQuoteCurrency(value: string | number | null | undefined) {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(n) ? n : 0);
}

// ——— Gravações (técnicas de preço) ———

export type EngravingPriceTierDto = {
  id?: string;
  qtyFrom: number;
  qtyTo: number;
  cost: string;
  costType: 'Unidade' | 'Intervalo';
  fixedFee: string;
  applicationCost: string;
};

export type EngravingTechniqueDto = {
  id: string;
  name: string;
  active: boolean;
  calculationType: string;
  multiplyColors: boolean;
  supplierCompany: string | null;
  tierCount: number;
  tiers: EngravingPriceTierDto[];
  createdAt: string;
  updatedAt: string;
};

export type EngravingImportSummary = {
  criadas: number;
  atualizadas: number;
  faixas: number;
  ignoradas: number;
  erros: string[];
};

const ENGRAVING_BASE = `${BASE}/engraving`;

export async function listEngravingTechniques() {
  return erpFetchJson<{ data: EngravingTechniqueDto[] }>(ENGRAVING_BASE);
}

export async function createEngravingTechnique(body: {
  name: string;
  calculationType?: string;
  multiplyColors?: boolean;
  supplierCompany?: string | null;
  active?: boolean;
  tiers: Array<{
    qtyFrom: number;
    qtyTo: number;
    cost: number;
    costType: 'Unidade' | 'Intervalo';
    fixedFee?: number;
    applicationCost?: number;
  }>;
}) {
  return erpFetchJson<EngravingTechniqueDto>(ENGRAVING_BASE, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateEngravingTechnique(
  id: string,
  body: Partial<{
    name: string;
    calculationType: string;
    multiplyColors: boolean;
    supplierCompany: string | null;
    active: boolean;
    tiers: Array<{
      qtyFrom: number;
      qtyTo: number;
      cost: number;
      costType: 'Unidade' | 'Intervalo';
      fixedFee?: number;
      applicationCost?: number;
    }>;
  }>,
) {
  return erpFetchJson<EngravingTechniqueDto>(`${ENGRAVING_BASE}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteEngravingTechnique(id: string) {
  return erpFetchJson<{ ok: boolean }>(`${ENGRAVING_BASE}/${id}`, {
    method: 'DELETE',
  });
}

export async function importEngravingExcel(file: File): Promise<EngravingImportSummary> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/erp/quotes/engraving/import', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { message: text };
    }
  }
  if (!res.ok) {
    const msg =
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      body.message !== undefined
        ? String(
            Array.isArray(body.message) ? body.message.join(' · ') : body.message,
          )
        : `Erro HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body as EngravingImportSummary;
}
