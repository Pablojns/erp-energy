-- Estoque próprio de Item Externo (Venda Externa), separado do estoque WEG.
ALTER TABLE "ExternalItem" ADD COLUMN IF NOT EXISTS "stockQty" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'ExternalItemStockMovementType'
  ) THEN
    CREATE TYPE "ExternalItemStockMovementType" AS ENUM ('INBOUND', 'OUTBOUND');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ExternalItemStockMovement" (
  "id" UUID NOT NULL,
  "externalItemId" UUID NOT NULL,
  "movementType" "ExternalItemStockMovementType" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "reference" TEXT,
  "notes" TEXT,
  "movedById" UUID,
  "movementDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalItemStockMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExternalItemStockMovement_externalItemId_idx"
  ON "ExternalItemStockMovement"("externalItemId");
CREATE INDEX IF NOT EXISTS "ExternalItemStockMovement_movementType_idx"
  ON "ExternalItemStockMovement"("movementType");
CREATE INDEX IF NOT EXISTS "ExternalItemStockMovement_movementDate_idx"
  ON "ExternalItemStockMovement"("movementDate");
CREATE INDEX IF NOT EXISTS "ExternalItemStockMovement_externalItemId_movementDate_idx"
  ON "ExternalItemStockMovement"("externalItemId", "movementDate");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ExternalItemStockMovement_externalItemId_fkey'
  ) THEN
    ALTER TABLE "ExternalItemStockMovement"
      ADD CONSTRAINT "ExternalItemStockMovement_externalItemId_fkey"
      FOREIGN KEY ("externalItemId") REFERENCES "ExternalItem"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ExternalItemStockMovement_movedById_fkey'
  ) THEN
    ALTER TABLE "ExternalItemStockMovement"
      ADD CONSTRAINT "ExternalItemStockMovement_movedById_fkey"
      FOREIGN KEY ("movedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
