import { dueDateFromEmissao, startOfUtcDay } from './contas-atraso';
import { extractDocumentoNumero } from './conta-azul.titulos';
import { isWegDestinatario } from './conta-azul.vendas-xml';
import { WEG_NF_ANO_CORTE } from './weg-nf-referencia';
import {
  invoiceNumberDigitList,
  invoiceNumberDigits,
  invoiceNumberMatchesRemessa,
} from '../orders/order-search';

export const NOTA_ABERTA_STATUS = {
  VAZIO: 'VAZIO',
  DECLARADO: 'DECLARADO',
  CONFIRMADO: 'CONFIRMADO',
  LEGADO: 'LEGADO',
} as const;

export type NotaAbertaStatus =
  (typeof NOTA_ABERTA_STATUS)[keyof typeof NOTA_ABERTA_STATUS];

export type NotaAbertaFonte = 'CONTA_AZUL' | 'PEDIDO' | 'AMBOS';

export type WegOrderNfInput = {
  id: string;
  code: string;
  externalOrderNumber: string | null;
  invoiceNumber: string | null;
  notaRemessa: string | null;
  invoicedAt: Date | null;
  createdAt: Date;
  customerName: string | null;
  invoiceHistory: Array<{
    invoiceNumber: string;
    invoiceValue: unknown;
    createdAt: Date;
  }>;
  exits: Array<{
    invoiceNumber: string;
    invoiceValue: unknown;
    exitDate: Date;
  }>;
};

export type CaTituloNfInput = {
  id: string;
  numero: string | null;
  descricao: string;
  contraParte: string | null;
  valor: unknown;
  competencia: Date | null;
  vencimento: Date;
};

export type WegNfCobrancaResumo = {
  id: string;
  enviadoEm: string;
  enviadoPara: string;
  enviadoPor: string | null;
};

export type WegNfConciliacaoInput = {
  invoiceDigits: string;
  declaradoPagoEm: Date | null;
  declaradoPagoValor: unknown;
  declaradoPagoDoc: string | null;
  confirmadoRecebidoEm: Date | null;
  confirmadoRecebidoPorNome: string | null;
  confirmadoRecebidoOrigem: string | null;
  alertaBancoData: Date | null;
  alertaBancoValor: unknown;
  alertaBancoNome: string | null;
  alertaBancoHistorico: string | null;
  orderId: string | null;
  contaAzulTituloId: string | null;
  cobrancas?: WegNfCobrancaResumo[];
};

export type NotaAbertaRow = {
  id: string;
  invoiceDigits: string;
  invoiceNumber: string;
  pedido: string;
  orderId: string | null;
  contaAzulTituloId: string | null;
  dataEmissao: string;
  vencimento: string;
  diasEmAberto: number;
  valor: number;
  fonte: NotaAbertaFonte;
  status: NotaAbertaStatus;
  legado: boolean;
  declaradoPagoEm: string | null;
  declaradoPagoValor: number | null;
  declaradoPagoDoc: string | null;
  confirmadoRecebidoEm: string | null;
  confirmadoRecebidoPor: string | null;
  confirmadoRecebidoOrigem: string | null;
  alertaVerificar: {
    data: string;
    valor: number;
    nome: string;
    historico: string;
  } | null;
  cobrancas: WegNfCobrancaResumo[];
};

function toNumber(value: unknown): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pedidoLabel(order: {
  externalOrderNumber: string | null;
  code: string;
}): string {
  const ext = String(order.externalOrderNumber ?? '').trim();
  return ext || order.code;
}

function pedidoFromCaDescricao(descricao: string): string {
  const m = String(descricao).match(/451\d{7,}/);
  return m?.[0] ?? descricao;
}

/**
 * NF do título CA: ignora número de pedido WEG (10+ dígitos) gravado em `numero`.
 */
export function caTituloNfDigits(
  numero: string | null | undefined,
  descricao: string,
): string {
  const fromNumero = invoiceNumberDigits(numero ?? '');
  if (fromNumero && fromNumero.length <= 8) return fromNumero;
  const fromDesc = invoiceNumberDigits(extractDocumentoNumero(null, descricao) ?? '');
  if (fromDesc && fromDesc.length <= 8) return fromDesc;
  return '';
}

function emissionYearUtc(d: Date): number {
  return startOfUtcDay(d).getUTCFullYear();
}

export function isNotaLegado(
  dataEmissao: Date,
  cutoffYear = WEG_NF_ANO_CORTE,
): boolean {
  return emissionYearUtc(dataEmissao) < cutoffYear;
}

function diasEmAberto(dataEmissao: Date, ref: Date): number {
  const start = startOfUtcDay(dataEmissao).getTime();
  const end = startOfUtcDay(ref).getTime();
  return Math.max(0, Math.floor((end - start) / (24 * 60 * 60 * 1000)));
}

type Acc = {
  invoiceDigits: string;
  invoiceNumber: string;
  pedido: string;
  orderId: string | null;
  contaAzulTituloId: string | null;
  dataEmissao: Date;
  valor: number;
  fromPedido: boolean;
  fromCa: boolean;
};

function collectOrderInvoices(orders: WegOrderNfInput[]): {
  byNf: Map<string, Acc>;
  remessa: Set<string>;
} {
  const remessa = new Set<string>();
  const byNf = new Map<string, Acc>();

  for (const order of orders) {
    for (const d of invoiceNumberDigitList(order.notaRemessa)) {
      remessa.add(d);
    }
  }

  const upsert = (
    digits: string,
    rawNumber: string,
    order: WegOrderNfInput,
    emissao: Date,
    valor: number,
  ) => {
    if (!digits || remessa.has(digits)) return;
    if (invoiceNumberMatchesRemessa(rawNumber, order.notaRemessa)) return;
    const existing = byNf.get(digits);
    if (existing) {
      if (!existing.valor && valor) existing.valor = valor;
      if (existing.dataEmissao.getTime() > emissao.getTime()) {
        existing.dataEmissao = emissao;
      }
      return;
    }
    byNf.set(digits, {
      invoiceDigits: digits,
      invoiceNumber: digits,
      pedido: pedidoLabel(order),
      orderId: order.id,
      contaAzulTituloId: null,
      dataEmissao: emissao,
      valor,
      fromPedido: true,
      fromCa: false,
    });
  };

  for (const order of orders) {
    const exitByNf = new Map<string, { valor: number; exitDate: Date }>();
    for (const ex of order.exits) {
      const digits = invoiceNumberDigits(ex.invoiceNumber);
      if (!digits) continue;
      exitByNf.set(digits, {
        valor: toNumber(ex.invoiceValue),
        exitDate: ex.exitDate,
      });
    }

    const seen = new Set<string>();
    for (const h of order.invoiceHistory) {
      const digits = invoiceNumberDigits(h.invoiceNumber);
      if (!digits || seen.has(digits)) continue;
      seen.add(digits);
      const exit = exitByNf.get(digits);
      upsert(
        digits,
        h.invoiceNumber,
        order,
        exit?.exitDate ?? order.invoicedAt ?? h.createdAt,
        exit?.valor || toNumber(h.invoiceValue),
      );
    }
    for (const digits of invoiceNumberDigitList(order.invoiceNumber)) {
      if (seen.has(digits)) continue;
      seen.add(digits);
      const exit = exitByNf.get(digits);
      upsert(
        digits,
        order.invoiceNumber ?? digits,
        order,
        exit?.exitDate ??
          order.invoicedAt ??
          order.exits[0]?.exitDate ??
          order.createdAt,
        exit?.valor ?? 0,
      );
    }
  }

  return { byNf, remessa };
}

export function mergeWegNotasAbertas(input: {
  orders: WegOrderNfInput[];
  titulos: CaTituloNfInput[];
  conciliacoes: WegNfConciliacaoInput[];
  now?: Date;
  includeLegado?: boolean;
}): NotaAbertaRow[] {
  const now = input.now ?? new Date();
  const { byNf, remessa } = collectOrderInvoices(input.orders);
  const orderByExternal = new Map<string, WegOrderNfInput>();
  for (const o of input.orders) {
    const ext = String(o.externalOrderNumber ?? '').replace(/\D/g, '');
    if (ext && !orderByExternal.has(ext)) orderByExternal.set(ext, o);
    if (ext.length >= 10) {
      const fam = ext.slice(0, 10);
      if (!orderByExternal.has(fam)) orderByExternal.set(fam, o);
    }
  }

  for (const t of input.titulos) {
    const digits = caTituloNfDigits(t.numero, t.descricao);
    if (!digits || remessa.has(digits)) continue;
    const looksWeg = isWegDestinatario(t.contraParte);
    const existing = byNf.get(digits);
    if (!existing && !looksWeg) continue;
    const emissao = t.competencia ?? t.vencimento;
    const pedidoHint = pedidoFromCaDescricao(t.descricao);
    const linked =
      orderByExternal.get(String(pedidoHint).replace(/\D/g, '')) ??
      (pedidoHint.length >= 10
        ? orderByExternal.get(String(pedidoHint).replace(/\D/g, '').slice(0, 10))
        : undefined);
    if (existing) {
      existing.fromCa = true;
      existing.contaAzulTituloId = t.id;
      if (!existing.valor) existing.valor = toNumber(t.valor);
      if (!existing.dataEmissao || existing.dataEmissao.getTime() === 0) {
        existing.dataEmissao = emissao;
      }
      continue;
    }
    byNf.set(digits, {
      invoiceDigits: digits,
      invoiceNumber: digits,
      pedido: linked ? pedidoLabel(linked) : pedidoHint,
      orderId: linked?.id ?? null,
      contaAzulTituloId: t.id,
      dataEmissao: emissao,
      valor: toNumber(t.valor),
      fromPedido: Boolean(linked),
      fromCa: true,
    });
  }

  const reconByNf = new Map(
    input.conciliacoes.map((c) => [c.invoiceDigits, c] as const),
  );

  const rows: NotaAbertaRow[] = [];
  for (const acc of byNf.values()) {
    if (!acc.dataEmissao || acc.dataEmissao.getTime() === 0) continue;
    const legado = isNotaLegado(acc.dataEmissao);
    if (legado && !input.includeLegado) continue;
    const recon = reconByNf.get(acc.invoiceDigits);
    let status: NotaAbertaStatus = NOTA_ABERTA_STATUS.VAZIO;
    if (recon?.confirmadoRecebidoEm) {
      status = NOTA_ABERTA_STATUS.CONFIRMADO;
    } else if (recon?.declaradoPagoEm) {
      status = NOTA_ABERTA_STATUS.DECLARADO;
    } else if (legado) {
      status = NOTA_ABERTA_STATUS.LEGADO;
    }
    const due = dueDateFromEmissao(acc.dataEmissao);
    rows.push({
      id: acc.invoiceDigits,
      invoiceDigits: acc.invoiceDigits,
      invoiceNumber: acc.invoiceNumber,
      pedido: acc.pedido,
      orderId: acc.orderId ?? recon?.orderId ?? null,
      contaAzulTituloId: acc.contaAzulTituloId ?? recon?.contaAzulTituloId ?? null,
      dataEmissao: acc.dataEmissao.toISOString(),
      vencimento: due.toISOString(),
      diasEmAberto: diasEmAberto(acc.dataEmissao, now),
      valor: acc.valor,
      fonte: acc.fromPedido && acc.fromCa ? 'AMBOS' : acc.fromCa ? 'CONTA_AZUL' : 'PEDIDO',
      status,
      legado,
      declaradoPagoEm: recon?.declaradoPagoEm?.toISOString() ?? null,
      declaradoPagoValor:
        recon?.declaradoPagoValor != null ? toNumber(recon.declaradoPagoValor) : null,
      declaradoPagoDoc: recon?.declaradoPagoDoc ?? null,
      confirmadoRecebidoEm: recon?.confirmadoRecebidoEm?.toISOString() ?? null,
      confirmadoRecebidoPor: recon?.confirmadoRecebidoPorNome ?? null,
      confirmadoRecebidoOrigem: recon?.confirmadoRecebidoOrigem ?? null,
      alertaVerificar:
        recon?.alertaBancoData && !recon.confirmadoRecebidoEm
          ? {
              data: recon.alertaBancoData.toISOString(),
              valor: toNumber(recon.alertaBancoValor),
              nome: recon.alertaBancoNome ?? '',
              historico: recon.alertaBancoHistorico ?? '',
            }
          : null,
      cobrancas: recon?.cobrancas ?? [],
    });
  }

  rows.sort((a, b) => {
    if (b.diasEmAberto !== a.diasEmAberto) return b.diasEmAberto - a.diasEmAberto;
    return a.invoiceDigits.localeCompare(b.invoiceDigits, undefined, { numeric: true });
  });
  return rows;
}

export function knownInvoiceDigits(rows: NotaAbertaRow[]): Set<string> {
  return new Set(rows.map((r) => r.invoiceDigits));
}
