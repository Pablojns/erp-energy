import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT migration_name, checksum FROM "_prisma_migrations" ORDER BY finished_at`,
  );
  console.log(rows);
}

main().finally(() => prisma.$disconnect());
