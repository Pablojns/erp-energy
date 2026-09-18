import { prisma } from '@erp/database';

async function main() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, length("accessToken") as len, "tokenType", "scope", "expiresAt", "refreshLockUntil", "updatedAt", "lastError" FROM "InterSession"`,
  );
  console.log(JSON.stringify(rows, null, 2));
  const now = new Date();
  console.log('now', now.toISOString());
  await prisma.$disconnect();
}

main();
