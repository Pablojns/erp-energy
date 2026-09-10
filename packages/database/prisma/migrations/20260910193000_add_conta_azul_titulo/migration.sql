ALTER TABLE "ContaAzulSession" ADD COLUMN IF NOT EXISTS "lastSyncAt" TIMESTAMP(3);
ALTER TABLE "ContaAzulSession" ADD COLUMN IF NOT EXISTS "lastSyncError" TEXT;

CREATE TABLE IF NOT EXISTS "ContaAzulTitulo" (
  "id" UUID NOT NULL,
  "contaAzulId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "origem" TEXT NOT NULL,
  "numero" TEXT,
  "descricao" TEXT NOT NULL,
  "contraParte" TEXT,
  "documento" TEXT,
  "valor" DECIMAL(12, 2) NOT NULL,
  "valorPago" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "valorAberto" DECIMAL(12, 2) NOT NULL,
  "vencimento" TIMESTAMP(3) NOT NULL,
  "competencia" TIMESTAMP(3),
  "status" TEXT NOT NULL,
  "pago" BOOLEAN NOT NULL DEFAULT false,
  "syncedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContaAzulTitulo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContaAzulTitulo_contaAzulId_key" ON "ContaAzulTitulo"("contaAzulId");
CREATE INDEX IF NOT EXISTS "ContaAzulTitulo_tipo_vencimento_idx" ON "ContaAzulTitulo"("tipo", "vencimento");
CREATE INDEX IF NOT EXISTS "ContaAzulTitulo_pago_vencimento_idx" ON "ContaAzulTitulo"("pago", "vencimento");
CREATE INDEX IF NOT EXISTS "ContaAzulTitulo_tipo_pago_idx" ON "ContaAzulTitulo"("tipo", "pago");
