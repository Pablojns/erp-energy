-- OrderStatus: replace legacy English enum with operational PT statuses
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";

CREATE TYPE "OrderStatus" AS ENUM (
  'NOVO',
  'ANALISADO',
  'PARCIAL',
  'RESERVADO',
  'EM_SEPARACAO',
  'SEPARADO',
  'AGUARDANDO_NF',
  'NF_ATRELADA',
  'EXPEDIDO',
  'FINALIZADO',
  'CANCELADO'
);

ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Order"
  ALTER COLUMN "status" TYPE "OrderStatus"
  USING (
    CASE "status"::text
      WHEN 'NEW' THEN 'NOVO'
      WHEN 'PENDING_STOCK' THEN 'PARCIAL'
      WHEN 'RESERVED' THEN 'RESERVADO'
      WHEN 'PICKING' THEN 'EM_SEPARACAO'
      WHEN 'PICKED' THEN 'SEPARADO'
      WHEN 'WAITING_INVOICE' THEN 'AGUARDANDO_NF'
      WHEN 'INVOICED' THEN 'NF_ATRELADA'
      WHEN 'SHIPPED' THEN 'EXPEDIDO'
      WHEN 'COMPLETED' THEN 'FINALIZADO'
      WHEN 'CANCELLED' THEN 'CANCELADO'
      ELSE 'NOVO'
    END::"OrderStatus"
  );

ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'NOVO'::"OrderStatus";

DROP TYPE "OrderStatus_old";

-- Novo tipo de movimentação: saída real com NF
ALTER TYPE "StockMovementType" ADD VALUE 'SAIDA_EXPEDICAO';

CREATE TYPE "OrderItemStockStatus" AS ENUM (
  'COMPLETO',
  'PARCIAL',
  'SEM_ESTOQUE',
  'NAO_ANALISADO',
  'SKU_NAO_ENCONTRADO'
);

ALTER TABLE "OrderItem" ADD COLUMN "availableAtAnalysis" INTEGER;
ALTER TABLE "OrderItem" ADD COLUMN "missingQty" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "pickedQty" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "invoicedQty" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "stockStatus" "OrderItemStockStatus" NOT NULL DEFAULT 'NAO_ANALISADO';

UPDATE "OrderItem"
SET
  "missingQty" = GREATEST(0, "quantity" - "reservedQuantity"),
  "stockStatus" = CASE
    WHEN "reservedQuantity" >= "quantity" AND "quantity" > 0 THEN 'COMPLETO'::"OrderItemStockStatus"
    WHEN "reservedQuantity" > 0 THEN 'PARCIAL'::"OrderItemStockStatus"
    WHEN "reservedQuantity" = 0 AND "quantity" > 0 THEN 'SEM_ESTOQUE'::"OrderItemStockStatus"
    ELSE 'NAO_ANALISADO'::"OrderItemStockStatus"
  END;

ALTER TABLE "StockMovement" ADD COLUMN "invoiceNumber" VARCHAR(64);

CREATE TYPE "OrderImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "OrderImportJob" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" "OrderSource" NOT NULL,
    "importStatus" "OrderImportStatus" NOT NULL DEFAULT 'PENDING',
    "importedAt" TIMESTAMP(3),
    "externalHash" TEXT,
    "payloadSummary" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderImportJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderImportJob_source_idx" ON "OrderImportJob"("source");
CREATE INDEX "OrderImportJob_importStatus_idx" ON "OrderImportJob"("importStatus");
CREATE INDEX "OrderImportJob_externalHash_idx" ON "OrderImportJob"("externalHash");
