-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sentToSeparationAt" TIMESTAMP(3);

-- Backfill: pedidos já na fila usam updatedAt como aproximação da entrada
UPDATE "Order"
SET "sentToSeparationAt" = "updatedAt"
WHERE "sentToSeparationAt" IS NULL
  AND "status"::text IN ('EM_SEPARACAO', 'SEPARADO', 'AGUARDANDO_NF', 'NF_ATRELADA');

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_sentToSeparationAt_idx" ON "Order"("sentToSeparationAt");
