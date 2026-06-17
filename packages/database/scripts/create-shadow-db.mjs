import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 AS ok FROM pg_database WHERE datname = 'erp_dev_shadow'`,
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    await prisma.$executeRawUnsafe(`CREATE DATABASE erp_dev_shadow`);
    console.log('Created erp_dev_shadow');
  } else {
    console.log('erp_dev_shadow already exists');
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
