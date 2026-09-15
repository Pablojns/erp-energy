-- Catálogo de itens que não entram no estoque interno WEG (Venda Externa / XML).
CREATE TABLE IF NOT EXISTS "ExternalItem" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "lastKnownPrice" DECIMAL(12,2) NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'Manual',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExternalItem_name_idx" ON "ExternalItem"("name");
CREATE INDEX IF NOT EXISTS "ExternalItem_createdAt_idx" ON "ExternalItem"("createdAt");

ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "externalItemId" UUID;

CREATE INDEX IF NOT EXISTS "OrderItem_externalItemId_idx" ON "OrderItem"("externalItemId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_externalItemId_fkey'
  ) THEN
    ALTER TABLE "OrderItem"
      ADD CONSTRAINT "OrderItem_externalItemId_fkey"
      FOREIGN KEY ("externalItemId") REFERENCES "ExternalItem"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
