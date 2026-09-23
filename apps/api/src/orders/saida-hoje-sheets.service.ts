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
  notaFiscal?: string;
};

const DEFAULT_SPREADSHEET_ID =
  '1W7n6XvkFvsVRr-E8oTTRHQ7Ca7RU3TEMFjYpC-MH0ok';
const DEFAULT_SHEET_NAME = 'SAIDA HOJE';

const HEADER_ALIASES: Record<keyof Omit<SaidaHojeRow, 'notaFiscal'> | 'notaFiscal', string[]> = {
  numeroPed: ['numero ped', 'número ped', 'numero pedido', 'nº ped', 'num ped'],
  cnpjEntrega: ['cnpj entrega', 'cnpj'],
  produto: ['produto', 'produto (sku - nome)', 'sku - nome'],
  quantidade: ['quantidade', 'qtd', 'qty'],
  pontoDescarga: ['ponto descarga', 'ponto de descarga'],
  recebedor: ['recebedor'],
  seq: ['seq', 'seq.', 'sequencia', 'sequência'],
  notaFiscal: ['nota fiscal', 'nf', 'nfe'],
};

export function buildSaidaHojeProduto(sku: string, name: string): string {
  const s = (sku || '').trim();
  const n = (name || '').trim();
  if (s && n) return `${s} - ${n}`;
  return s || n || '—';
}

export function saidaHojeDedupKey(numeroPed: string, seq: number | string): string {
  return `${String(numeroPed).trim()}::${String(seq).trim()}`;
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

type ColMap = Partial<Record<keyof SaidaHojeRow | 'notaFiscal', number>>;

export function mapSaidaHojeHeaders(headerRow: string[]): ColMap {
  const map: ColMap = {};
  headerRow.forEach((cell, idx) => {
    const norm = normalizeHeader(cell);
    if (!norm) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<
      [keyof typeof HEADER_ALIASES, string[]]
    >) {
      if (map[field] != null) continue;
      if (aliases.some((a) => norm === a || norm.includes(a))) {
        map[field] = idx;
      }
    }
  });
  return map;
}

export function rowValuesForColumns(
  row: SaidaHojeRow,
  colMap: ColMap,
  width: number,
): string[] {
  const out = Array.from({ length: width }, () => '');
  const set = (field: keyof SaidaHojeRow | 'notaFiscal', value: string) => {
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
  set('notaFiscal', row.notaFiscal ?? '');
  return out;
}

@Injectable()
export class SaidaHojeSheetsService {
  private readonly logger = new AppLogger(SaidaHojeSheetsService.name);

  private credentialsPath(): string {
    return (
      process.env.GOOGLE_SHEETS_CREDENTIALS_PATH?.trim() ||
      path.join(process.cwd(), 'credentials-sheets.json')
    );
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
   */
  async upsertRows(rows: SaidaHojeRow[]): Promise<{
    written: number;
    updated: number;
  }> {
    if (rows.length === 0) return { written: 0, updated: 0 };
    if (!this.isConfigured()) {
      this.logger.warn('SAIDA HOJE sheets skipped: credentials missing', {
        path: this.credentialsPath(),
      });
      return { written: 0, updated: 0 };
    }

    const sheets = await this.client();
    const spreadsheetId = this.spreadsheetId();
    const sheetName = this.sheetName();
    const range = `'${sheetName}'!A1:H`;

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

    const width = Math.max(header.length, 8);
    const indexByKey = new Map<string, number>();
    for (let i = 1; i < values.length; i++) {
      const line = values[i] ?? [];
      const ped = String(line[colMap.numeroPed] ?? '').trim();
      const seq = String(line[colMap.seq] ?? '').trim();
      if (!ped || !seq) continue;
      indexByKey.set(saidaHojeDedupKey(ped, seq), i);
    }

    const dataUpdates: sheets_v4.Schema$ValueRange[] = [];
    const toAppend: string[][] = [];
    let updated = 0;
    let written = 0;

    for (const row of rows) {
      const key = saidaHojeDedupKey(row.numeroPed, row.seq);
      const cells = rowValuesForColumns(row, colMap, width);
      const existingIdx = indexByKey.get(key);
      if (existingIdx != null) {
        // Preserva Nota Fiscal já preenchida pelo robô.
        if (colMap.notaFiscal != null) {
          const prevNf = String(
            values[existingIdx]?.[colMap.notaFiscal] ?? '',
          ).trim();
          if (prevNf) cells[colMap.notaFiscal] = prevNf;
        }
        const rowNumber = existingIdx + 1;
        dataUpdates.push({
          range: `'${sheetName}'!A${rowNumber}:${colLetter(width - 1)}${rowNumber}`,
          values: [cells],
        });
        updated += 1;
      } else {
        toAppend.push(cells);
        written += 1;
        indexByKey.set(key, values.length + toAppend.length - 1);
      }
    }

    if (dataUpdates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: dataUpdates,
        },
      });
    }

    if (toAppend.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${sheetName}'!A:H`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: toAppend },
      });
    }

    this.logger.info('SAIDA HOJE sheets upsert done', {
      written,
      updated,
      total: rows.length,
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
