import { Injectable } from '@nestjs/common';
import { google, sheets_v4 } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { AppLogger } from '../common/logger/app-logger';

export type SaidaHojeRow = {
  numeroPed: string;
  cnpjEntrega: string;
  produto: string;
  quantidade: number;
  pontoDescarga: string;
  recebedor: string;
  seq: number;
  /** dd/MM/yyyy opcional — coluna "Data Pedido" */
  dataPedido?: string;
  /** dd/MM/yyyy opcional — coluna "DATA ENTREGA" */
  dataEntrega?: string;
  notaFiscal?: string;
};

const DEFAULT_SPREADSHEET_ID =
  '1W7n6XvkFvsVRr-E8oTTRHQ7Ca7RU3TEMFjYpC-MH0ok';
const DEFAULT_SHEET_NAME = 'SAIDA HOJE';

type FieldKey = keyof SaidaHojeRow;

const HEADER_ALIASES: Record<FieldKey, string[]> = {
  numeroPed: ['numero ped', 'número ped', 'numero pedido', 'nº ped', 'num ped'],
  dataPedido: ['data pedido'],
  dataEntrega: ['data entrega', 'data de entrega'],
  seq: ['seq', 'seq.', 'sequencia', 'sequência'],
  produto: ['produto', 'produto (sku - nome)', 'sku - nome'],
  quantidade: ['quantidade', 'qtd', 'qty'],
  cnpjEntrega: ['cnpj entrega', 'cnpj'],
  pontoDescarga: ['ponto descarga', 'ponto de descarga'],
  recebedor: ['recebedor'],
  notaFiscal: ['nota fiscal', 'nf', 'nfe'],
};

export function buildSaidaHojeProduto(sku: string, name: string): string {
  const s = (sku || '').trim();
  const n = (name || '').trim();
  if (s && n) return `${s} - ${n}`;
  return s || n || '—';
}

export function saidaHojeDedupKey(
  numeroPed: string,
  seq: number | string,
): string {
  return `${String(numeroPed).trim()}::${String(seq).trim()}`;
}

export function formatSaidaHojeDate(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function normalizeHeader(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function colLetter(index0: number): string {
  let n = index0 + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

type ColMap = Partial<Record<FieldKey, number>>;

export function mapSaidaHojeHeaders(headerRow: string[]): ColMap {
  const map: ColMap = {};
  headerRow.forEach((cell, idx) => {
    const norm = normalizeHeader(cell);
    if (!norm) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<
      [FieldKey, string[]]
    >) {
      if (map[field] != null) continue;
      if (aliases.some((a) => norm === a || norm.includes(a))) {
        map[field] = idx;
      }
    }
  });
  return map;
}

/** Preenche só as colunas gerenciadas; demais células vêm de `base` (update) ou ''. */
export function rowValuesForColumns(
  row: SaidaHojeRow,
  colMap: ColMap,
  width: number,
  base?: string[],
): string[] {
  const out = Array.from({ length: width }, (_, i) =>
    base && base[i] != null ? String(base[i]) : '',
  );
  const set = (field: FieldKey, value: string) => {
    const idx = colMap[field];
    if (idx == null || idx < 0 || idx >= width) return;
    out[idx] = value;
  };
  set('numeroPed', row.numeroPed);
  set('cnpjEntrega', row.cnpjEntrega);
  set('produto', row.produto);
  set('quantidade', String(row.quantidade));
  set('pontoDescarga', row.pontoDescarga);
  set('recebedor', row.recebedor);
  set('seq', String(row.seq));
  if (row.dataPedido) set('dataPedido', row.dataPedido);
  if (row.dataEntrega) set('dataEntrega', row.dataEntrega);
  if (row.notaFiscal != null && String(row.notaFiscal).trim() !== '') {
    set('notaFiscal', row.notaFiscal);
  }
  return out;
}

function comparePedidoSeq(pedA: string, seqA: number, pedB: string, seqB: number): number {
  const ped = pedA.trim().localeCompare(pedB.trim(), 'pt-BR', {
    numeric: true,
    sensitivity: 'base',
  });
  if (ped !== 0) return ped;
  return seqA - seqB;
}

function compareSaidaHojeRows(a: SaidaHojeRow, b: SaidaHojeRow): number {
  return comparePedidoSeq(a.numeroPed, a.seq, b.numeroPed, b.seq);
}

/** Agrupa por pedido e, dentro do pedido, pela sequência da linha. */
export function sortSaidaHojeRows(rows: SaidaHojeRow[]): SaidaHojeRow[] {
  return [...rows].sort(compareSaidaHojeRows);
}

function parseSaidaHojeSeq(raw: string | undefined): number {
  const n = Number(String(raw ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

/**
 * Reordena a grade (sem cabeçalho) por Numero Ped e Seq crescente.
 * Linhas sem pedido ficam no fim, na ordem em que já estavam.
 * Linhas totalmente vazias saem para não abrir buraco no meio do bloco.
 */
export function sortSaidaHojeSheetLines(
  lines: string[][],
  numeroPedCol: number,
  seqCol: number,
): string[][] {
  const filled = lines.filter((line) =>
    line.some((cell) => String(cell ?? '').trim() !== ''),
  );
  return [...filled].sort((a, b) => {
    const pedA = String(a[numeroPedCol] ?? '').trim();
    const pedB = String(b[numeroPedCol] ?? '').trim();
    if (!pedA && pedB) return 1;
    if (pedA && !pedB) return -1;
    return comparePedidoSeq(
      pedA,
      parseSaidaHojeSeq(a[seqCol]),
      pedB,
      parseSaidaHojeSeq(b[seqCol]),
    );
  });
}

function padSheetLine(line: string[] | undefined, width: number): string[] {
  return Array.from({ length: width }, (_, i) => String(line?.[i] ?? ''));
}

function sameSheetGrid(a: string[][], b: string[][]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (left.length !== right.length) return false;
    for (let c = 0; c < left.length; c++) {
      if (left[c] !== right[c]) return false;
    }
  }
  return true;
}

/**
 * Mesma chave (Numero Ped + Seq) fica uma vez; a última ocorrência vence.
 * A posição segue a ordem por pedido / seq.
 */
function dedupeSaidaHojeRows(rows: SaidaHojeRow[]): SaidaHojeRow[] {
  const sorted = sortSaidaHojeRows(rows);
  const indexByKey = new Map<string, number>();
  const unique: SaidaHojeRow[] = [];
  for (const row of sorted) {
    const key = saidaHojeDedupKey(row.numeroPed, row.seq);
    const prev = indexByKey.get(key);
    if (prev == null) {
      indexByKey.set(key, unique.length);
      unique.push(row);
    } else {
      unique[prev] = row;
    }
  }
  return unique;
}

@Injectable()
export class SaidaHojeSheetsService {
  private readonly logger = new AppLogger(SaidaHojeSheetsService.name);
  /** Serializa upserts: o lote dispara uma escrita por pedido sem esperar a anterior. */
  private writeChain: Promise<void> = Promise.resolve();

  private credentialsPath(): string {
    const fromEnv = process.env.GOOGLE_SHEETS_CREDENTIALS_PATH?.trim();
    if (fromEnv) return fromEnv;
    const candidates = [
      path.join(process.cwd(), 'apps/api/credentials-sheets.json'),
      path.join(process.cwd(), 'credentials-sheets.json'),
      // dist/orders → apps/api
      path.join(__dirname, '..', '..', 'credentials-sheets.json'),
      '/var/www/erp-energy/apps/api/credentials-sheets.json',
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return candidates[0];
  }

  private spreadsheetId(): string {
    return (
      process.env.SAIDA_HOJE_SPREADSHEET_ID?.trim() || DEFAULT_SPREADSHEET_ID
    );
  }

  private sheetName(): string {
    return process.env.SAIDA_HOJE_SHEET_NAME?.trim() || DEFAULT_SHEET_NAME;
  }

  isConfigured(): boolean {
    if (process.env.SAIDA_HOJE_SHEETS_ENABLED === '0') return false;
    return fs.existsSync(this.credentialsPath());
  }

  /**
   * Upsert por Numero Ped + Seq. Falhas devem ser tratadas pelo caller
   * (nunca bloquear send-to-picking).
   *
   * Depois do upsert a aba inteira é regravada ordenada por Numero Ped e Seq.
   * O robô lê por Numero Ped (não pela posição da linha). Escritas simultâneas
   * entram na fila para um lote não gravar um snapshot antigo por cima do outro.
   */
  async upsertRows(rows: SaidaHojeRow[]): Promise<{
    written: number;
    updated: number;
  }> {
    if (rows.length === 0) return { written: 0, updated: 0 };
    const run = this.writeChain.then(() => this.writeRows(rows));
    this.writeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async writeRows(rows: SaidaHojeRow[]): Promise<{
    written: number;
    updated: number;
  }> {
    if (!this.isConfigured()) {
      this.logger.warn('SAIDA HOJE sheets skipped: credentials missing', {
        path: this.credentialsPath(),
      });
      return { written: 0, updated: 0 };
    }

    const sheets = await this.client();
    const spreadsheetId = this.spreadsheetId();
    const sheetName = this.sheetName();
    const range = `'${sheetName}'`;

    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      majorDimension: 'ROWS',
    });

    const values = (existing.data.values ?? []) as string[][];
    if (values.length === 0) {
      throw new Error(`Aba "${sheetName}" vazia ou sem cabeçalho.`);
    }

    const header = values[0].map((c) => String(c ?? ''));
    const colMap = mapSaidaHojeHeaders(header);
    if (colMap.numeroPed == null || colMap.seq == null) {
      throw new Error(
        `Cabeçalho da aba "${sheetName}" sem colunas Numero Ped / Seq.`,
      );
    }

    const width = Math.max(header.length, 14);
    const indexByKey = new Map<string, number>();
    for (let i = 1; i < values.length; i++) {
      const line = values[i] ?? [];
      const ped = String(line[colMap.numeroPed] ?? '').trim();
      const seq = String(line[colMap.seq] ?? '').trim();
      if (!ped || !seq) continue;
      indexByKey.set(saidaHojeDedupKey(ped, seq), i);
    }

    const unique = dedupeSaidaHojeRows(rows);
    const toUpdate: SaidaHojeRow[] = [];
    const toInsert: SaidaHojeRow[] = [];
    for (const row of unique) {
      const key = saidaHojeDedupKey(row.numeroPed, row.seq);
      if (indexByKey.has(key)) toUpdate.push(row);
      else toInsert.push(row);
    }

    const widthFromRows = values.reduce(
      (max, line) => Math.max(max, line?.length ?? 0),
      width,
    );
    const grid = values
      .slice(1)
      .map((line) => padSheetLine(line, widthFromRows));

    for (const row of toUpdate) {
      const key = saidaHojeDedupKey(row.numeroPed, row.seq);
      const existingIdx = indexByKey.get(key);
      if (existingIdx == null) continue;
      const prev = grid[existingIdx - 1] ?? padSheetLine(undefined, widthFromRows);
      // Preserva Nota Fiscal já preenchida pelo robô.
      const cells = rowValuesForColumns(row, colMap, widthFromRows, prev);
      if (colMap.notaFiscal != null) {
        const prevNf = String(prev[colMap.notaFiscal] ?? '').trim();
        if (prevNf) cells[colMap.notaFiscal] = prevNf;
      }
      grid[existingIdx - 1] = cells;
    }

    for (const row of toInsert) {
      grid.push(rowValuesForColumns(row, colMap, widthFromRows));
    }

    const sorted = sortSaidaHojeSheetLines(
      grid,
      colMap.numeroPed,
      colMap.seq,
    );
    const previousFilled = values
      .slice(1)
      .map((line) => padSheetLine(line, widthFromRows))
      .filter((line) => line.some((cell) => cell.trim() !== ''));
    const previousDataRows = Math.max(0, values.length - 1);

    const needsRewrite =
      !sameSheetGrid(sorted, previousFilled) ||
      previousDataRows !== sorted.length;

    if (needsRewrite && sorted.length > 0) {
      const endRow = sorted.length + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${sheetName}'!A2:${colLetter(widthFromRows - 1)}${endRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: sorted },
      });
      if (previousDataRows > sorted.length) {
        await sheets.spreadsheets.values.clear({
          spreadsheetId,
          range: `'${sheetName}'!A${endRow + 1}:${colLetter(widthFromRows - 1)}${
            previousDataRows + 1
          }`,
        });
      }
    }

    const updated = toUpdate.length;
    const written = toInsert.length;

    this.logger.info('SAIDA HOJE sheets upsert done', {
      written,
      updated,
      total: rows.length,
      credentials: this.credentialsPath(),
    });

    return { written, updated };
  }

  private async client(): Promise<sheets_v4.Sheets> {
    const credPath = this.credentialsPath();
    if (!fs.existsSync(credPath)) {
      throw new Error(`Credencial Sheets não encontrada: ${credPath}`);
    }
    const auth = new google.auth.GoogleAuth({
      keyFile: credPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return google.sheets({ version: 'v4', auth });
  }
}
