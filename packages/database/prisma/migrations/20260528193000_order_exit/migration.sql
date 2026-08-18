-- CreateTable
CREATE TABLE "OrderExit" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "invoiceNumber" VARCHAR(64) NOT NULL,
    "invoiceValue" DECIMAL(12,2) NOT NULL,
    "exitDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "carrierName" VARCHAR(120),
    "trackingCode" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderExit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderExit_orderId_key" ON "OrderExit"("orderId");

-- CreateIndex
CREATE INDEX "OrderExit_invoiceNumber_idx" ON "OrderExit"("invoiceNumber");

-- CreateIndex
CREATE INDEX "OrderExit_exitDate_idx" ON "OrderExit"("exitDate");

-- CreateIndex
CREATE INDEX "OrderExit_carrierName_idx" ON "OrderExit"("carrierName");

-- AddForeignKey
ALTER TABLE "OrderExit"
ADD CONSTRAINT "OrderExit_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
