CREATE TABLE IF NOT EXISTS "WegNfConciliacao" (
  "id" UUID NOT NULL,
  "invoiceDigits" TEXT NOT NULL,
  "orderId" UUID,
  "contaAzulTituloId" UUID,
  "declaradoPagoEm" TIMESTAMP(3),
  "declaradoPagoValor" DECIMAL(12, 2),
  "declaradoPagoDoc" TEXT,
  "confirmadoRecebidoEm" TIMESTAMP(3),
  "confirmadoRecebidoPorId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WegNfConciliacao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WegNfConciliacao_invoiceDigits_key" ON "WegNfConciliacao"("invoiceDigits");
CREATE INDEX IF NOT EXISTS "WegNfConciliacao_orderId_idx" ON "WegNfConciliacao"("orderId");
CREATE INDEX IF NOT EXISTS "WegNfConciliacao_contaAzulTituloId_idx" ON "WegNfConciliacao"("contaAzulTituloId");
CREATE INDEX IF NOT EXISTS "WegNfConciliacao_confirmadoRecebidoPorId_idx" ON "WegNfConciliacao"("confirmadoRecebidoPorId");

ALTER TABLE "WegNfConciliacao"
  ADD CONSTRAINT "WegNfConciliacao_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WegNfConciliacao"
  ADD CONSTRAINT "WegNfConciliacao_contaAzulTituloId_fkey"
  FOREIGN KEY ("contaAzulTituloId") REFERENCES "ContaAzulTitulo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WegNfConciliacao"
  ADD CONSTRAINT "WegNfConciliacao_confirmadoRecebidoPorId_fkey"
  FOREIGN KEY ("confirmadoRecebidoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
