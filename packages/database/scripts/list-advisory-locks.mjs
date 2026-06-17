import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const locks = await prisma.$queryRawUnsafe(`
    SELECT l.pid, l.granted, a.state, a.application_name, left(a.query, 120) AS query
    FROM pg_locks l
    JOIN pg_stat_activity a ON a.pid = l.pid
    WHERE l.locktype = 'advisory'
    ORDER BY l.granted DESC, l.pid
  `);
  console.log('Advisory locks:', locks);
}

main().finally(() => prisma.$disconnect());
