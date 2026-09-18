CREATE TABLE IF NOT EXISTS "InterSession" (
  "id" TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "tokenType" TEXT NOT NULL DEFAULT 'Bearer',
  "scope" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "refreshLockUntil" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InterSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WegNfCobrancaEnvio" (
  "id" UUID NOT NULL,
  "conciliacaoId" UUID NOT NULL,
  "invoiceDigits" TEXT NOT NULL,
  "enviadoPara" TEXT NOT NULL,
  "assunto" TEXT NOT NULL,
  "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "enviadoPorId" UUID,
  "anexos" TEXT,
  "messageId" TEXT,
  CONSTRAINT "WegNfCobrancaEnvio_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WegNfCobrancaEnvio_conciliacaoId_idx" ON "WegNfCobrancaEnvio"("conciliacaoId");
CREATE INDEX IF NOT EXISTS "WegNfCobrancaEnvio_invoiceDigits_idx" ON "WegNfCobrancaEnvio"("invoiceDigits");
CREATE INDEX IF NOT EXISTS "WegNfCobrancaEnvio_enviadoEm_idx" ON "WegNfCobrancaEnvio"("enviadoEm");

ALTER TABLE "WegNfCobrancaEnvio"
  ADD CONSTRAINT "WegNfCobrancaEnvio_conciliacaoId_fkey"
  FOREIGN KEY ("conciliacaoId") REFERENCES "WegNfConciliacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WegNfCobrancaEnvio"
  ADD CONSTRAINT "WegNfCobrancaEnvio_enviadoPorId_fkey"
  FOREIGN KEY ("enviadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
