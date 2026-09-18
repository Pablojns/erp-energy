import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@erp/database';
import { PrismaService } from '../prisma/prisma.service';
import { InterIntegrationService } from '../financeiro/inter-integration.service';
import { parseInterCsv } from '../financeiro/bank-credits';

function loadEnvFile(): void {
  for (const envPath of [
    resolve(__dirname, '../../../.env'),
    resolve(__dirname, '../../.env'),
  ]) {
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
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
  }
}

async function main() {
  loadEnvFile();
  const inter = new InterIntegrationService(new PrismaService(), new ConfigService());
  const t1 = await inter.ensureToken();
  const t2 = await inter.ensureToken();
  console.log('token reuse', t1.accessToken === t2.accessToken);

  const raw = (await inter.apiGet('/banking/v2/extrato', {
    dataInicio: '2026-08-01',
    dataFim: '2026-08-31',
  })) as { transacoes?: Array<Record<string, unknown>> };
  const list = raw.transacoes ?? [];
  console.log('agosto simples count', list.length);
  console.log('sample', JSON.stringify(list.slice(0, 5), null, 2));
  const ops = new Map<string, number>();
  for (const t of list) {
    const k = String(t.tipoOperacao ?? '?');
    ops.set(k, (ops.get(k) ?? 0) + 1);
  }
  console.log('tipoOperacao', Object.fromEntries(ops));

  try {
    const completo = await inter.apiGet('/banking/v2/extrato/completo', {
      dataInicio: '2026-08-01',
      dataFim: '2026-08-31',
      tamanhoPagina: 1000,
      pagina: 0,
    });
    console.log('completo type', typeof completo);
    console.log(
      'completo preview',
      JSON.stringify(completo, null, 2).slice(0, 2000),
    );
  } catch (e) {
    console.log('completo err', e instanceof Error ? e.message : e);
  }

  const csv = parseInterCsv(
    readFileSync(
      'C:/Users/SUNHUB/Downloads/Extrato-01-01-2026-a-31-08-2026-CSV.csv',
    ),
  );
  const csvAug = csv.filter((c) => {
    const m = c.date.getUTCMonth();
    return m === 7; // agosto
  });
  console.log('csv agosto credits', csvAug.length, 'sum', csvAug.reduce((s, c) => s + c.amount, 0).toFixed(2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
