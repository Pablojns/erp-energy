import { erpFetchJson } from '@/src/services/api/erp-fetch';

export const CORREIOS_SERVICES = [
  { id: 'PAC', label: 'PAC', codigo: '03298' },
  { id: 'SEDEX', label: 'SEDEX', codigo: '03220' },
  { id: 'MINI', label: 'MINI ENVIOS', codigo: '04227' },
] as const;

export type CorreiosServiceId = (typeof CORREIOS_SERVICES)[number]['id'];

export type CorreiosQuoteResult = {
  valor: string | null;
  prazoDias: number | null;
  erro?: string;
};

export type CorreiosTrackingEvent = {
  data: string;
  hora: string;
  local: string;
  descricao: string;
};

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function parseMoney(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const num = Number(raw.replace(',', '.'));
  if (Number.isFinite(num)) {
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  return raw;
}

function parsePrazoDias(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  const candidates = [
    row.prazoEntrega,
    row.prazo,
    row.prazoDias,
    row.qtDias,
  ];
  for (const candidate of candidates) {
    const num = Number(candidate);
    if (Number.isFinite(num) && num > 0) return Math.round(num);
  }
  return null;
}

function parsePrecoValor(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  return (
    parseMoney(row.pcFinal) ||
    parseMoney(row.vlTotalServico) ||
    parseMoney(row.valor) ||
    parseMoney(row.preco)
  );
}

export async function cotarCorreios(params: {
  codigoServico: string;
  cepOrigem: string;
  cepDestino: string;
  pesoGramas?: number;
  comprimento?: number;
  largura?: number;
  altura?: number;
}): Promise<CorreiosQuoteResult> {
  const cepOrigem = onlyDigits(params.cepOrigem);
  const cepDestino = onlyDigits(params.cepDestino);
  const peso = params.pesoGramas ?? 500;
  const comprimento = params.comprimento ?? 20;
  const largura = params.largura ?? 15;
  const altura = params.altura ?? 10;

  const precoQuery = new URLSearchParams({
    cepOrigem,
    cepDestino,
    peso: String(peso),
    comprimento: String(comprimento),
    largura: String(largura),
    altura: String(altura),
  });

  try {
    const [preco, prazo] = await Promise.all([
      erpFetchJson<unknown>(
        `correios/preco/${params.codigoServico}?${precoQuery.toString()}`,
      ),
      erpFetchJson<unknown>(
        `correios/prazo/${params.codigoServico}?cepOrigem=${cepOrigem}&cepDestino=${cepDestino}`,
      ),
    ]);

    return {
      valor: parsePrecoValor(preco),
      prazoDias: parsePrazoDias(prazo),
    };
  } catch (error) {
    return {
      valor: null,
      prazoDias: null,
      erro: error instanceof Error ? error.message : 'Falha ao cotar frete.',
    };
  }
}

export function parseCorreiosTrackingEvents(data: unknown): CorreiosTrackingEvent[] {
  const objetos = (() => {
    if (!data || typeof data !== 'object') return [];
    const root = data as Record<string, unknown>;
    if (Array.isArray(root.objetos)) return root.objetos;
    if (Array.isArray(root)) return root;
    return [root];
  })();

  const events: CorreiosTrackingEvent[] = [];

  for (const objeto of objetos) {
    if (!objeto || typeof objeto !== 'object') continue;
    const row = objeto as Record<string, unknown>;
    const list = Array.isArray(row.eventos) ? row.eventos : [];
    for (const evento of list) {
      if (!evento || typeof evento !== 'object') continue;
      const ev = evento as Record<string, unknown>;
      const dtHr = String(ev.dtHrCriado ?? ev.data ?? ev.dataHora ?? '').trim();
      const [dataPart, horaPart] = dtHr.includes('T')
        ? dtHr.split('T')
        : dtHr.split(' ');
      const unidade = ev.unidade as Record<string, unknown> | undefined;
      const endereco = unidade?.endereco as Record<string, unknown> | undefined;
      const cidade = String(endereco?.cidade ?? '').trim();
      const uf = String(endereco?.uf ?? '').trim();
      const localBase = String(unidade?.nome ?? ev.local ?? ev.unidadeDestino ?? '').trim();
      const local = [localBase, cidade, uf].filter(Boolean).join(' · ') || '—';

      events.push({
        data: dataPart || '—',
        hora: (horaPart ?? '').slice(0, 8) || '—',
        local,
        descricao: String(ev.descricao ?? ev.status ?? ev.tipo ?? 'Evento').trim(),
      });
    }
  }

  return events;
}

export async function rastrearCorreios(codigo: string): Promise<{
  codigo: string;
  eventos: CorreiosTrackingEvent[];
}> {
  const clean = codigo.trim().toUpperCase();
  const data = await erpFetchJson<unknown>(`correios/rastrear/${encodeURIComponent(clean)}`);
  return {
    codigo: clean,
    eventos: parseCorreiosTrackingEvents(data),
  };
}

export async function rastrearCorreiosLote(codigos: string[]): Promise<unknown> {
  return erpFetchJson('correios/rastrear/lote', {
    method: 'POST',
    body: JSON.stringify({ codigos }),
  });
}

export type CorreiosCepDto = {
  cep?: string;
  logradouro?: string;
  end?: string;
  bairro?: string;
  localidade?: string;
  cidade?: string;
  uf?: string;
};

export async function buscarCepCorreios(cep: string): Promise<CorreiosCepDto> {
  const digits = onlyDigits(cep);
  return erpFetchJson<CorreiosCepDto>(`correios/cep/${digits}`);
}

export type CorreiosRemetentePadraoDto = {
  nome: string;
  cpfCnpj: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
  telefone?: string;
  email?: string;
};

export async function getCorreiosRemetentePadrao() {
  return erpFetchJson<CorreiosRemetentePadraoDto>('correios/remetente-padrao');
}

export type CorreiosManualLabelInput = {
  remetente: {
    nome: string;
    cpfCnpj: string;
    cep: string;
    logradouro: string;
    numero: string;
    complemento?: string;
    bairro: string;
    cidade: string;
    uf: string;
    telefone?: string;
    email?: string;
  };
  destinatarioNome: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
  codigoServico: string;
  pesoGramas: number;
  valorDeclarado: number;
  servicoLabel: string;
};

export type CorreiosEtiquetaDto = {
  id: string;
  codigoRastreio: string;
  prePostagemId: string;
  nomeDestinatario: string;
  cepDestino: string;
  servico: string;
  status: string;
  createdAt: string;
  userId: string | null;
};

export async function listCorreiosEtiquetas() {
  return erpFetchJson<CorreiosEtiquetaDto[]>('correios/etiquetas');
}

export async function cancelarEtiquetaCorreios(prePostagemId: string) {
  return erpFetchJson<{ ok?: boolean }>(
    `correios/prepostagem/${encodeURIComponent(prePostagemId)}`,
    { method: 'DELETE' },
  );
}

export async function excluirEtiquetaCorreios(id: string) {
  return erpFetchJson<{ ok: boolean }>(`correios/etiquetas/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function criarPrePostagemManual(input: CorreiosManualLabelInput) {
  return erpFetchJson<Record<string, unknown>>('correios/prepostagem', {
    method: 'POST',
    body: JSON.stringify({
      remetente: {
        nome: input.remetente.nome,
        cpfCnpj: onlyDigits(input.remetente.cpfCnpj),
        cep: onlyDigits(input.remetente.cep),
        logradouro: input.remetente.logradouro,
        numero: input.remetente.numero,
        complemento: input.remetente.complemento ?? '',
        bairro: input.remetente.bairro,
        cidade: input.remetente.cidade,
        uf: input.remetente.uf.toUpperCase().slice(0, 2),
        telefone: input.remetente.telefone ?? '',
        email: input.remetente.email ?? '',
      },
      destinatario: {
        nome: input.destinatarioNome,
        cep: onlyDigits(input.cep),
        logradouro: input.logradouro,
        numero: input.numero,
        complemento: input.complemento ?? '',
        bairro: input.bairro,
        cidade: input.cidade,
        uf: input.uf.toUpperCase().slice(0, 2),
      },
      objeto: {
        codigoServico: input.codigoServico,
        pesoGramas: input.pesoGramas,
        comprimento: 16,
        largura: 11,
        altura: 2,
        valorDeclarado: input.valorDeclarado,
        descricaoConteudo: 'Envio manual',
      },
      historico: {
        nomeDestinatario: input.destinatarioNome,
        cepDestino: onlyDigits(input.cep),
        servico: input.servicoLabel,
      },
    }),
  });
}

async function erpFetchCorreiosBlob(
  segmentsPath: string,
  init?: RequestInit,
): Promise<Blob> {
  const path = segmentsPath
    .replace(/^\//, '')
    .replace(/^api\/erp\/?/, '')
    .replace(/^api\//, '');
  const res = await fetch(`/api/erp/${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    let message = `Erro HTTP ${res.status}`;
    try {
      const body = JSON.parse(text) as { message?: string | string[] };
      if (body.message) {
        message = Array.isArray(body.message)
          ? body.message.join(' · ')
          : body.message;
      }
    } catch {
      if (text.trim()) message = text.trim();
    }
    throw new Error(message);
  }
  return res.blob();
}

export function openCorreiosPdfBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function gerarRotuloCorreios(idsPrePostagem: string[]) {
  const blob = await erpFetchCorreiosBlob('correios/rotulo', {
    method: 'POST',
    body: JSON.stringify({ idsPrePostagem, tipoRotulo: 'P' }),
  });
  openCorreiosPdfBlob(blob);
}

export async function baixarComprovanteEntrega(codigo: string) {
  const clean = codigo.trim().toUpperCase();
  const blob = await erpFetchCorreiosBlob(
    `correios/comprovante/${encodeURIComponent(clean)}`,
  );
  openCorreiosPdfBlob(blob);
}

export function isCorreiosObjetoEntregue(eventos: CorreiosTrackingEvent[]): boolean {
  if (eventos.length === 0) return false;
  return eventos.some((evento) => {
    const descricao = evento.descricao.toLowerCase();
    return descricao.includes('entregue');
  });
}
