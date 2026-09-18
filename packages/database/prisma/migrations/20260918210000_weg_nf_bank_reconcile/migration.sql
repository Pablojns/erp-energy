ALTER TABLE "WegNfConciliacao"
  ADD COLUMN IF NOT EXISTS "confirmadoRecebidoOrigem" TEXT,
  ADD COLUMN IF NOT EXISTS "alertaBancoData" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "alertaBancoValor" DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "alertaBancoNome" TEXT,
  ADD COLUMN IF NOT EXISTS "alertaBancoHistorico" TEXT;
