/**
 * Arquiva pedidos históricos (data < 01/01/2026) ainda em status não-finalizado.
 *
 * Por padrão roda em dry-run (só reporta contagem). Para aplicar:
 *   npx ts-node -r tsconfig-paths/register src/scripts/archive-pre-2026-orders.ts --apply
 *
 * Uso (em apps/api):
 *   npx ts-node -r tsconfig-paths/register src/scripts/archive-pre-2026-orders.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { OrderStatus, prisma } from '@erp/database';

const CUTOFF = new Date('2026-01-01T00:00:00.000Z');

/** Status “pendentes” / operacionais — não FINALIZADO, CANCELADO nem já ARQUIVADO. */
const PENDING_STATUSES: OrderStatus[] = [
  OrderStatus.NOVO,
  OrderStatus.ANALISADO,
  OrderStatus.PARCIAL,
  OrderStatus.RESERVADO,
  OrderStatus.EM_SEPARACAO,
  OrderStatus.SEPARADO,
  OrderStatus.AGUARDANDO_NF,
  OrderStatus.NF_ATRELADA,
  OrderStatus.EXPEDIDO,
];

function loadEnvFile(): void {
  const envPath = resolve(__dirname, '../../.env');
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
  } catch {
    /* .env opcional se DATABASE_URL já estiver no ambiente */
  }
}

function archiveWhere() {
  return {
    status: { in: PENDING_STATUSES },
    OR: [
      { orderDate: { lt: CUTOFF } },
      {
        AND: [{ orderDate: null }, { createdAt: { lt: CUTOFF } }],
      },
    ],
  };
}

async function main() {
  loadEnvFile();
  const apply = process.argv.includes('--apply');

  console.log('=== archive-pre-2026-orders ===');
  console.log(
    apply
      ? 'Modo: APPLY (vai alterar o banco)'
      : 'Modo: DRY-RUN (não altera nada)',
  );
  console.log(`Corte: orderDate < ${CUTOFF.toISOString()} (ou createdAt se orderDate nulo)`);
  console.log(`Status alvo: ${PENDING_STATUSES.join(', ')}`);
  console.log('');

  const byStatus = await prisma.order.groupBy({
    by: ['status'],
    where: archiveWhere(),
    _count: { _all: true },
    orderBy: { status: 'asc' },
  });

  const total = byStatus.reduce((sum, row) => sum + row._count._all, 0);

  console.log('Contagem por status:');
  if (byStatus.length === 0) {
    console.log('  (nenhum pedido encontrado)');
  } else {
    for (const row of byStatus) {
      console.log(`  ${row.status}: ${row._count._all}`);
    }
  }
  console.log('');
  console.log(`TOTAL a arquivar: ${total}`);

  const sample = await prisma.order.findMany({
    where: archiveWhere(),
    select: {
      id: true,
      code: true,
      externalOrderNumber: true,
      status: true,
      orderDate: true,
      createdAt: true,
    },
    orderBy: [{ orderDate: 'asc' }, { createdAt: 'asc' }],
    take: 15,
  });

  if (sample.length > 0) {
    console.log('');
    console.log(`Amostra (até ${sample.length}):`);
    for (const o of sample) {
      const num = o.externalOrderNumber?.trim() || o.code;
      const when = (o.orderDate ?? o.createdAt).toISOString().slice(0, 10);
      console.log(`  #${num} | ${o.status} | data=${when}`);
    }
  }

  if (!apply) {
    console.log('');
    console.log(
      'Dry-run concluído. Para aplicar: acrescente --apply ao comando.',
    );
    return;
  }

  if (total === 0) {
    console.log('Nada a aplicar.');
    return;
  }

  const result = await prisma.order.updateMany({
    where: archiveWhere(),
    data: { status: OrderStatus.ARQUIVADO },
  });

  console.log('');
  console.log(`Pedidos atualizados para ARQUIVADO: ${result.count}`);
}

void main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
