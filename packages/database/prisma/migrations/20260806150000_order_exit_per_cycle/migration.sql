-- Pedido parcial pode voltar para separação várias vezes: cada ciclo registra a
-- própria saída. O índice único em orderId impedia a 2ª saída (o registro do
-- ciclo anterior era encontrado e a nova parcela nunca era gravada).
DROP INDEX IF EXISTS "OrderExit_orderId_key";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderExit_orderId_idx" ON "OrderExit"("orderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderExit_orderId_exitDate_idx" ON "OrderExit"("orderId", "exitDate");
