import { invoiceDigits } from './conta-azul.auth';

export type CaNfResumo = {
  numero: string;
  numeroDigits: string;
  status: string | null;
  dataEmissao: string | null;
  destinatario: string | null;
  chaveAcesso: string | null;
  idVenda: string | null;
  valor: number | null;
};

export type ErpNfResumo = {
  orderId: string;
  pedido: string;
  invoiceNumber: string;
  invoiceDigits: string;
  status: string;
  invoiceValue: number | null;
};

export type ContaAzulDivergencia = {
  tipo:
    | 'ca_sem_erp'
    | 'erp_sem_ca'
    | 'finalize_gap';
  nf: string;
  pedido?: string;
  detalhe: string;
};

export function extractNfValor(item: Record<string, unknown>): number | null {
  const candidates = [
    item.valor,
    item.valor_total,
    item.valor_total_nfe,
    item.valor_total_nfse,
    item.valor_nota,
  ];
  for (const raw of candidates) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function mapContaAzulNf(item: Record<string, unknown>): CaNfResumo {
  const numero = String(
    item.numero_nota ?? item.numero_nfse ?? item.numero ?? '',
  );
  return {
    numero,
    numeroDigits: invoiceDigits(numero),
    status: item.status != null ? String(item.status) : null,
    dataEmissao:
      item.data_emissao != null ? String(item.data_emissao) : null,
    destinatario:
      item.nome_destinatario != null
        ? String(item.nome_destinatario)
        : item.nome_tomador != null
          ? String(item.nome_tomador)
          : null,
    chaveAcesso:
      item.chave_acesso != null ? String(item.chave_acesso) : null,
    idVenda: item.id_venda != null ? String(item.id_venda) : null,
    valor: extractNfValor(item),
  };
}

export function reconcileContaAzulNfs(input: {
  ca: CaNfResumo[];
  erp: ErpNfResumo[];
  finalizeGaps: Array<{ pedido: string; invoiceNumber: string | null; message: string }>;
}): {
  matched: number;
  divergencias: ContaAzulDivergencia[];
} {
  const caByNf = new Map<string, CaNfResumo>();
  for (const nf of input.ca) {
    if (nf.numeroDigits) caByNf.set(nf.numeroDigits, nf);
  }
  const erpByNf = new Map<string, ErpNfResumo>();
  for (const nf of input.erp) {
    if (nf.invoiceDigits) erpByNf.set(nf.invoiceDigits, nf);
  }

  const divergencias: ContaAzulDivergencia[] = [];
  let matched = 0;

  for (const [digits, ca] of caByNf) {
    const erp = erpByNf.get(digits);
    if (!erp) {
      divergencias.push({
        tipo: 'ca_sem_erp',
        nf: ca.numero || digits,
        detalhe: `NF ${ca.numero || digits} existe na Conta Azul (${ca.status ?? 'sem status'}) e não no ERP.`,
      });
      continue;
    }
    matched += 1;
  }

  for (const [digits, erp] of erpByNf) {
    if (caByNf.has(digits)) continue;
    divergencias.push({
      tipo: 'erp_sem_ca',
      nf: erp.invoiceNumber,
      pedido: erp.pedido,
      detalhe: `NF ${erp.invoiceNumber} (pedido ${erp.pedido}) existe no ERP e não veio na consulta da Conta Azul no período.`,
    });
  }

  for (const gap of input.finalizeGaps) {
    const digits = invoiceDigits(gap.invoiceNumber);
    if (digits && !caByNf.has(digits)) continue;
    divergencias.push({
      tipo: 'finalize_gap',
      nf: gap.invoiceNumber ?? '',
      pedido: gap.pedido,
      detalhe: gap.message,
    });
  }

  return { matched, divergencias };
}
