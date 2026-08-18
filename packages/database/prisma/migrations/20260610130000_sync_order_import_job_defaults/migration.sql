-- Alinha defaults de OrderImportJob com schema.prisma
ALTER TABLE "OrderImportJob" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "OrderImportJob" ALTER COLUMN "updatedAt" DROP DEFAULT;
