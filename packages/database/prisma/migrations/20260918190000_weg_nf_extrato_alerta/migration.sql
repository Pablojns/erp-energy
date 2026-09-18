ALTER TABLE "WegNfConciliacao"
  ADD COLUMN IF NOT EXISTS "confirmadoRecebidoOrigem" TEXT;

ALTER TABLE "WegNfConciliacao"
  ADD COLUMN IF NOT EXISTS "alertaBancoData" TIMESTAMP(3);

ALTER TABLE "WegNfConciliacao"
  ADD COLUMN IF NOT EXISTS "alertaBancoValor" DECIMAL(12, 2);

ALTER TABLE "WegNfConciliacao"
  ADD COLUMN IF NOT EXISTS "alertaBancoNome" TEXT;

ALTER TABLE "WegNfConciliacao"
  ADD COLUMN IF NOT EXISTS "alertaBancoHistorico" TEXT;
