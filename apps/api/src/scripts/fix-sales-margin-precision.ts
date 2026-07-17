/**
 * Atualiza orçamentos com salesMarginPercent impreciso (78.07 / 78.070175)
 * para o valor validado 78.070175438596.
 *
 * Uso (em apps/api):
 *   npx ts-node -r tsconfig-paths/register src/scripts/fix-sales-margin-precision.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Prisma, prisma } from '@erp/database';

const PRECISE_MARGIN = '78.070175438596';
const LEGACY_MARGINS = ['78.07', '78.0700', '78.070175', '78.070175000000'];

function loadEnvFile(): void {
  const candidates = [
    resolve(__dirname, '../../.env'),
    resolve(__dirname, '../../../.env'),
  ];
  for (const envPath of candidates) {
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
        if (!(key in process.env)) {
          process.env[key] = value;
        }
      }
      return;
    } catch {
      /* tenta próximo caminho */
    }
  }
}

async function main() {
  loadEnvFile();

  const precise = new Prisma.Decimal(PRECISE_MARGIN);
  const legacy = LEGACY_MARGINS.map((v) => new Prisma.Decimal(v));

  const before = await prisma.quote.count({
    where: { salesMarginPercent: { in: legacy } },
  });

  const result = await prisma.quote.updateMany({
    where: { salesMarginPercent: { in: legacy } },
    data: { salesMarginPercent: precise },
  });

  console.log(
    `[fix-sales-margin-precision] orçamentos com margem legada: ${before}`,
  );
  console.log(
    `[fix-sales-margin-precision] atualizados para ${PRECISE_MARGIN}: ${result.count}`,
  );
}

main()
  .catch((err) => {
    console.error('[fix-sales-margin-precision] falha:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
