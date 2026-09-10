ALTER TABLE "ContaAzulTitulo" ADD COLUMN IF NOT EXISTS "categoria" TEXT;
ALTER TABLE "ContaAzulTitulo" ADD COLUMN IF NOT EXISTS "centroCusto" TEXT;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "contaAzulVendaId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Order_contaAzulVendaId_key" ON "Order"("contaAzulVendaId");

CREATE TABLE IF NOT EXISTS "ContaAzulCategoria" (
  "id" UUID NOT NULL,
  "contaAzulId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "paiId" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "syncedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContaAzulCategoria_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ContaAzulCategoria_contaAzulId_key" ON "ContaAzulCategoria"("contaAzulId");
CREATE INDEX IF NOT EXISTS "ContaAzulCategoria_nome_idx" ON "ContaAzulCategoria"("nome");

CREATE TABLE IF NOT EXISTS "ContaAzulCentroCusto" (
  "id" UUID NOT NULL,
  "contaAzulId" TEXT NOT NULL,
  "codigo" TEXT,
  "nome" TEXT NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "syncedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContaAzulCentroCusto_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ContaAzulCentroCusto_contaAzulId_key" ON "ContaAzulCentroCusto"("contaAzulId");
CREATE INDEX IF NOT EXISTS "ContaAzulCentroCusto_nome_idx" ON "ContaAzulCentroCusto"("nome");
CREATE INDEX IF NOT EXISTS "ContaAzulCentroCusto_codigo_idx" ON "ContaAzulCentroCusto"("codigo");
