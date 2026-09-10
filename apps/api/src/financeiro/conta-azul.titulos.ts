export type CaTituloTipo = 'RECEBER' | 'PAGAR';

export type CaTitulo = {
  contaAzulId: string;
  tipo: CaTituloTipo;
  origem: 'receber' | 'pagar';
  numero: string | null;
  descricao: string;
  contraParte: string | null;
  documento: string | null;
  valor: number;
  valorPago: number;
  valorAberto: number;
  vencimento: Date;
  competencia: Date | null;
  status: string;
  pago: boolean;
  categoria?: string | null;
  centroCusto?: string | null;
};

const PAID_STATUS = new Set([
  'RECEBIDO',
  'PAGO',
  'PAID',
  'RECEIVED',
  'PERDIDO',
  'CANCELADO',
  'CANCELLED',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asText(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function asNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function parseCaDate(raw: unknown): Date | null {
  const s = asText(raw);
  if (!s) return null;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (ymd) {
    return new Date(
      Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), 12, 0, 0, 0),
    );
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function nestedName(raw: unknown, keys: string[]): string | null {
  const rec = asRecord(raw);
  if (!rec) return asText(raw);
  for (const key of keys) {
    const v = asText(rec[key]);
    if (v) return v;
  }
  return null;
}

/** Número da NF/documento já presente no payload ou na descrição sincronizada. */
export function extractDocumentoNumero(
  item: Record<string, unknown> | null | undefined,
  descricao?: string | null,
): string | null {
  const rec = item ?? {};
  const fatura = asRecord(rec.fatura);
  const fromFields =
    asText(rec.numero) ??
    asText(rec.numero_documento) ??
    asText(rec.numero_boleto) ??
    asText(rec.numero_nota) ??
    asText(rec.numero_nfse) ??
    (fatura ? asText(fatura.numero) : null);
  if (fromFields) return fromFields;

  const text = asText(descricao) ?? asText(rec.descricao) ?? asText(rec.historico);
  if (!text) return null;
  const nfE = text.match(/\bNF[\s.-]*e\s*[:.]?\s*(\d+(?:-\d+)?)/i);
  if (nfE?.[1]) return nfE[1];
  const nfsE = text.match(/\bNFS[\s.-]*e\s*[:.]?\s*(\d+(?:-\d+)?)/i);
  if (nfsE?.[1]) return nfsE[1];
  const nf = text.match(/\bNF\s*[:.]?\s*(\d+)/i);
  if (nf?.[1]) return nf[1];
  const boleto = text.match(/\b(?:boleto|documento|doc)\s*[:.#-]?\s*(\d+)/i);
  if (boleto?.[1]) return boleto[1];
  return null;
}

export function extractNamedLabels(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const names: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) {
      names.push(item.trim());
      continue;
    }
    const rec = asRecord(item);
    if (!rec) continue;
    const nested =
      asRecord(rec.categoria) ??
      asRecord(rec.centro_de_custo) ??
      asRecord(rec.centroCusto);
    const nome =
      asText(rec.nome) ??
      asText(rec.descricao) ??
      asText(rec.categoria) ??
      asText(rec.centro_de_custo) ??
      (nested ? asText(nested.nome) ?? asText(nested.descricao) : null);
    if (nome) names.push(nome);
  }
  return names.length ? [...new Set(names)].join(' | ') : null;
}

function resolveStatus(item: Record<string, unknown>): string {
  return (
    asText(item.status_traduzido) ??
    asText(item.status) ??
    'EM_ABERTO'
  ).toUpperCase();
}

function mapTitulo(
  item: Record<string, unknown>,
  tipo: CaTituloTipo,
  origem: 'receber' | 'pagar',
): CaTitulo | null {
  const id = asText(item.id);
  const vencimento = parseCaDate(
    item.data_vencimento ?? item.dataVencimento ?? item.due_date,
  );
  if (!id || !vencimento) return null;

  const valor = asNumber(item.total ?? item.valor ?? item.valor_total);
  const valorPago = asNumber(item.pago ?? item.valor_pago);
  const valorAbertoRaw = item.nao_pago ?? item.valor_aberto ?? item.aberto;
  const valorAberto =
    valorAbertoRaw != null ? asNumber(valorAbertoRaw) : Math.max(0, valor - valorPago);
  const status = resolveStatus(item);
  const pago =
    PAID_STATUS.has(status) || valorAberto <= 0.009;

  const pessoa =
    asRecord(item.cliente) ??
    asRecord(item.fornecedor) ??
    asRecord(item.pessoa);

  const descricao =
    asText(item.descricao) ??
    asText(item.historico) ??
    (tipo === 'RECEBER' ? 'Conta a receber' : 'Conta a pagar');

  return {
    contaAzulId: id,
    tipo,
    origem,
    numero: extractDocumentoNumero(item, descricao),
    descricao,
    contraParte:
      nestedName(pessoa, ['nome', 'razao_social', 'nome_fantasia']) ??
      asText(item.nome_cliente) ??
      asText(item.nome_fornecedor),
    documento:
      nestedName(pessoa, ['documento', 'cnpj', 'cpf']) ??
      asText(item.documento_cliente) ??
      asText(item.documento_fornecedor),
    valor,
    valorPago,
    valorAberto: pago ? 0 : valorAberto,
    vencimento,
    competencia: parseCaDate(item.data_competencia ?? item.data_emissao),
    status,
    pago,
    categoria: extractNamedLabels(
      item.categorias ?? item.categoria ?? item.categorias_rateio,
    ),
    centroCusto: extractNamedLabels(
      item.centros_de_custo ??
        item.centros_custo ??
        item.centro_de_custo ??
        item.centrosCusto,
    ),
  };
}

export function mapContaAzulReceber(item: Record<string, unknown>): CaTitulo | null {
  return mapTitulo(item, 'RECEBER', 'receber');
}

export function mapContaAzulPagar(item: Record<string, unknown>): CaTitulo | null {
  return mapTitulo(item, 'PAGAR', 'pagar');
}

export function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

export function isCaOverdue(titulo: CaTitulo, now: Date = new Date()): boolean {
  if (titulo.pago) return false;
  return startOfUtcDay(titulo.vencimento).getTime() < startOfUtcDay(now).getTime();
}

export function tituloFromDbRow(row: {
  contaAzulId: string;
  tipo: string;
  origem: string;
  numero: string | null;
  descricao: string;
  contraParte: string | null;
  documento: string | null;
  valor: unknown;
  valorPago: unknown;
  valorAberto: unknown;
  vencimento: Date;
  competencia: Date | null;
  status: string;
  pago: boolean;
  categoria?: string | null;
  centroCusto?: string | null;
}): CaTitulo {
  return {
    contaAzulId: row.contaAzulId,
    tipo: row.tipo === 'PAGAR' ? 'PAGAR' : 'RECEBER',
    origem: row.origem === 'pagar' ? 'pagar' : 'receber',
    numero: row.numero ?? extractDocumentoNumero(null, row.descricao),
    descricao: row.descricao,
    contraParte: row.contraParte,
    documento: row.documento,
    valor: Number(row.valor) || 0,
    valorPago: Number(row.valorPago) || 0,
    valorAberto: Number(row.valorAberto) || 0,
    vencimento: new Date(row.vencimento),
    competencia: row.competencia ? new Date(row.competencia) : null,
    status: row.status,
    pago: Boolean(row.pago),
    categoria: row.categoria ?? null,
    centroCusto: row.centroCusto ?? null,
  };
}

export function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type CalendarioItemTipo = CaTituloTipo | 'COMPRAS';

export type CalendarioItem = {
  id: string;
  tipo: CalendarioItemTipo;
  numero: string | null;
  descricao: string;
  contraParte: string | null;
  valor: number;
  status: string;
  pago: boolean;
  vencimento: string;
  overdue: boolean;
};

export type CalendarioDia = {
  ymd: string;
  aPagar: number;
  aReceber: number;
  compras: number;
  overdue: boolean;
  items: CalendarioItem[];
};

export function groupTitulosByDay(
  titulos: CaTitulo[],
  now: Date = new Date(),
): Record<string, CalendarioDia> {
  const days: Record<string, CalendarioDia> = {};
  for (const t of titulos) {
    const ymd = ymdUtc(t.vencimento);
    const overdue = isCaOverdue(t, now);
    const valor = t.pago ? 0 : t.valorAberto || t.valor;
    let day = days[ymd];
    if (!day) {
      day = { ymd, aPagar: 0, aReceber: 0, compras: 0, overdue: false, items: [] };
      days[ymd] = day;
    }
    if (!t.pago && t.tipo === 'PAGAR') day.aPagar += valor;
    if (!t.pago && t.tipo === 'RECEBER') day.aReceber += valor;
    if (overdue) day.overdue = true;
    day.items.push({
      id: t.contaAzulId,
      tipo: t.tipo,
      numero: t.numero,
      descricao: t.descricao,
      contraParte: t.contraParte,
      valor: t.pago ? t.valor : valor,
      status: t.status,
      pago: t.pago,
      vencimento: t.vencimento.toISOString(),
      overdue,
    });
  }
  return days;
}
