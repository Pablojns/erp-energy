/**
 * Probe local: OAuth Inter + extrato API vs CSV já testado.
 *   cd apps/api
 *   npx ts-node -r tsconfig-paths/register src/scripts/probe-inter-api-vs-csv.ts
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@erp/database';
import { PrismaService } from '../prisma/prisma.service';
import { InterIntegrationService } from '../financeiro/inter-integration.service';
import { isWegBankPayer, parseInterCsv } from '../financeiro/bank-credits';

const CSV = 'C:/Users/SUNHUB/Downloads/Extrato-01-01-2026-a-31-08-2026-CSV.csv';

function loadEnvFile(): void {
  const candidates = [
    resolve(__dirname, '../../../.env'),
    resolve(__dirname, '../../.env'),
  ];
  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue;
    try {
      const content = readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = value;
      }
    } catch {
      /* ignore */
    }
  }
}

function sum(amounts: number[]): number {
  return amounts.reduce((s, n) => s + n, 0);
}

async function main() {
  loadEnvFile();
  if (!existsSync(CSV)) {
    throw new Error(`CSV não encontrado: ${CSV}`);
  }

  const prismaSvc = new PrismaService();
  const config = new ConfigService();
  const inter = new InterIntegrationService(prismaSvc, config);

  console.log('=== Inter status ===');
  console.log(await inter.status());

  console.log('\n=== OAuth token ===');
  const session = await inter.ensureToken();
  console.log({
    expiresAt: session.expiresAt.toISOString(),
    scope: session.scope,
    tokenPrefix: session.accessToken.slice(0, 12) + '…',
  });

  console.log('\n=== Saldo ===');
  try {
    const saldo = await inter.getSaldo();
    console.log(saldo);
  } catch (e) {
    console.warn('Saldo falhou:', e instanceof Error ? e.message : e);
  }

  const inicio = new Date('2026-01-01T12:00:00.000Z');
  const fim = new Date('2026-08-31T12:00:00.000Z');

  console.log('\n=== Extrato API (2026-01-01 → 2026-08-31) ===');
  const api = await inter.fetchExtratoCredits(inicio, fim);
  console.log({
    path: api.path,
    chunks: api.chunks,
    rawTransactionCount: api.rawTransactionCount,
    creditCount: api.credits.length,
  });

  const csvCredits = parseInterCsv(readFileSync(CSV));
  const csvWeg = csvCredits.filter((c) =>
    isWegBankPayer(`${c.counterparty} ${c.historico}`),
  );
  const apiWeg = api.credits.filter((c) =>
    isWegBankPayer(`${c.counterparty} ${c.historico}`),
  );

  const csvSum = sum(csvCredits.map((c) => c.amount));
  const apiSum = sum(api.credits.map((c) => c.amount));
  const csvWegSum = sum(csvWeg.map((c) => c.amount));
  const apiWegSum = sum(apiWeg.map((c) => c.amount));

  console.log('\n=== Comparação CSV × API ===');
  console.log({
    csvCredits: csvCredits.length,
    apiCredits: api.credits.length,
    csvTotal: Number(csvSum.toFixed(2)),
    apiTotal: Number(apiSum.toFixed(2)),
    deltaTotal: Number((apiSum - csvSum).toFixed(2)),
    csvWeg: csvWeg.length,
    apiWeg: apiWeg.length,
    csvWegTotal: Number(csvWegSum.toFixed(2)),
    apiWegTotal: Number(apiWegSum.toFixed(2)),
    deltaWeg: Number((apiWegSum - csvWegSum).toFixed(2)),
  });

  const csvKeys = new Set(
    csvCredits.map(
      (c) => `${c.date.toISOString().slice(0, 10)}|${c.amount.toFixed(2)}`,
    ),
  );
  let matched = 0;
  for (const c of api.credits) {
    const k = `${c.date.toISOString().slice(0, 10)}|${c.amount.toFixed(2)}`;
    if (csvKeys.has(k)) matched += 1;
  }
  console.log({
    apiCreditsMatchedInCsvByDateAmount: matched,
    matchRatePct: Number(
      ((matched / Math.max(api.credits.length, 1)) * 100).toFixed(1),
    ),
  });

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
