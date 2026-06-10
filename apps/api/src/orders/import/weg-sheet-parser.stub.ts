/**
 * Contrato futuro para importação da planilha Mercado Eletrônico / WEG.
 * Cada linha vira um `OrderItem`; agrupamento por Numero F → `Order.externalOrderNumber`.
 *
 * Implementação real (CSV/XLSX/Google Sheets export) ficará em service dedicado — sem upload neste momento.
 */

export interface WegSheetRow {
  numeroF: string;
  dataPed: string | Date | null;
  dataEn: string | Date | null;
  seq: number;
  produtoSkuNome: string;
  quantidade: number;
  cnpjEntrega: string | null;
  pontoDescarga: string | null;
  recebedor: string | null;
  statusMe: string | null;
  statusCa: string | null;
  notaFiscal: string | null;
  valorTotal: string | number | null;
  observacao: string | null;
}

/** Agrupa linhas pelo número do pedido (Numero F). */
export function groupWegSheetRowsByNumeroF(
  rows: WegSheetRow[],
): Map<string, WegSheetRow[]> {
  const map = new Map<string, WegSheetRow[]>();
  for (const row of rows) {
    const key = row.numeroF.trim();
    const arr = map.get(key);
    if (arr) arr.push(row);
    else map.set(key, [row]);
  }
  return map;
}

export abstract class WegSheetImportParser {
  abstract parse(buffer: Uint8Array): WegSheetRow[];
}
