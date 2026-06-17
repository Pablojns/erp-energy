import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const db = await prisma.$queryRawUnsafe(`SELECT current_database(), current_schema()`);
  console.log('Connection:', db);

  const schemas = await prisma.$queryRawUnsafe(
    `SELECT schemaname, tablename FROM pg_tables WHERE tablename IN ('Order', 'order', '_prisma_migrations') ORDER BY schemaname, tablename`,
  );
  console.log('Table locations:', schemas);

  try {
    const sample = await prisma.$queryRawUnsafe(`SELECT id, code FROM public."Order" LIMIT 1`);
    console.log('Order sample:', sample);
  } catch (e) {
    console.log('Order query error:', e.message);
  }

  try {
    const allCols = await prisma.$queryRawUnsafe(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name ILIKE '%order%' ORDER BY table_name, ordinal_position`,
    );
    console.log('order-like columns:', allCols);
  } catch (e) {
    console.log('columns query error:', e.message);
  }

  try {
    const migrations = await prisma.$queryRawUnsafe(
      `SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY finished_at`,
    );
    console.log('Applied migrations:', migrations);
  } catch (e) {
    console.log('Migrations table:', e.message);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
