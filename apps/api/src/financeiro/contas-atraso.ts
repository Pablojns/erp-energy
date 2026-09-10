/** Prazo padrão até o vencimento da NF financeira (mesmo critério do status ATRASADO). */
export const NF_PRAZO_DIAS = 12;

export type ContaAtrasoTone = 'critico' | 'atencao' | 'normal';

export type ContaAtrasoTitulo = {
  id: string;
  invoiceNumber: string;
  pedido: string;
  cnpj: string;
  cnpjKey: string;
  valor: number;
  dataEmissao: string;
  dueDate: string;
  diasAtraso: number;
  tone: ContaAtrasoTone;
};

export type ContaAtrasoGrupo = {
  cnpj: string;
  cnpjKey: string;
  titulos: number;
  valorTotal: number;
  diasAtrasoMaisAntigo: number;
  tone: ContaAtrasoTone;
  itens: ContaAtrasoTitulo[];
};

export type ExitValor = {
  invoiceNumber: string;
  invoiceValue: number;
  exitDate: Date;
};

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function formatCnpj(raw: string): string {
  const d = digitsOnly(raw);
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  const trimmed = raw.trim();
  return trimmed || '—';
}

/** CNPJ do comprador: deliveryCnpj, senão customerDocument. */
export function buyerCnpj(
  deliveryCnpj?: string | null,
  customerDocument?: string | null,
): { cnpj: string; cnpjKey: string } {
  const raw = deliveryCnpj?.trim() || customerDocument?.trim() || '';
  const cnpjKey = digitsOnly(raw);
  return {
    cnpjKey: cnpjKey || '—',
    cnpj: formatCnpj(raw),
  };
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days,
      12,
      0,
      0,
      0,
    ),
  );
}

export function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

export function dueDateFromEmissao(
  dataEmissao: Date,
  prazoDias = NF_PRAZO_DIAS,
): Date {
  return addUtcDays(startOfUtcDay(dataEmissao), prazoDias);
}

/** Dias corridos após o vencimento. 0 se ainda não venceu. */
export function diasAtrasoFromDue(
  dueDate: Date,
  ref: Date = new Date(),
): number {
  const start = startOfUtcDay(dueDate).getTime();
  const end = startOfUtcDay(ref).getTime();
  return Math.max(0, Math.floor((end - start) / (24 * 60 * 60 * 1000)));
}

export function atrasoTone(diasAtraso: number): ContaAtrasoTone {
  if (diasAtraso > 30) return 'critico';
  if (diasAtraso >= 7) return 'atencao';
  return 'normal';
}

export function tituloCompletouXDiasAtraso(
  diasAtraso: number,
  threshold: number,
): boolean {
  const x = Math.max(0, threshold);
  return diasAtraso >= x && x >= 0 && diasAtraso > 0;
}

/**
 * Uma linha por NF individual (OrderExit). Nunca usa o total do pedido.
 * Sem saídas, cai no valor já gravado em FinanceiroNF.
 */
export function resolveNfLines(input: {
  invoiceNumber: string;
  fallbackValor: number;
  fallbackEmissao: Date;
  exits: ExitValor[];
}): Array<{ invoiceNumber: string; valor: number; dataEmissao: Date }> {
  const exits = input.exits.filter((e) => e.invoiceNumber.trim());
  if (exits.length === 0) {
    return [
      {
        invoiceNumber: input.invoiceNumber,
        valor: input.fallbackValor,
        dataEmissao: input.fallbackEmissao,
      },
    ];
  }
  return exits.map((e) => ({
    invoiceNumber: e.invoiceNumber,
    valor: e.invoiceValue,
    dataEmissao: e.exitDate,
  }));
}

export function groupContasEmAtraso(
  titulos: ContaAtrasoTitulo[],
): ContaAtrasoGrupo[] {
  const byCnpj = new Map<string, ContaAtrasoTitulo[]>();
  for (const t of titulos) {
    const key = t.cnpjKey.trim() || '—';
    const list = byCnpj.get(key);
    if (list) list.push(t);
    else byCnpj.set(key, [t]);
  }

  const grupos: ContaAtrasoGrupo[] = [];
  for (const [cnpjKey, itens] of byCnpj) {
    const diasAtrasoMaisAntigo = itens.reduce(
      (max, it) => Math.max(max, it.diasAtraso),
      0,
    );
    grupos.push({
      cnpjKey,
      cnpj: itens[0]?.cnpj ?? formatCnpj(cnpjKey),
      titulos: itens.length,
      valorTotal: itens.reduce((sum, it) => sum + it.valor, 0),
      diasAtrasoMaisAntigo,
      tone: atrasoTone(diasAtrasoMaisAntigo),
      itens: [...itens].sort((a, b) => b.diasAtraso - a.diasAtraso),
    });
  }

  grupos.sort((a, b) => {
    if (b.diasAtrasoMaisAntigo !== a.diasAtrasoMaisAntigo) {
      return b.diasAtrasoMaisAntigo - a.diasAtrasoMaisAntigo;
    }
    return b.valorTotal - a.valorTotal;
  });
  return grupos;
}
