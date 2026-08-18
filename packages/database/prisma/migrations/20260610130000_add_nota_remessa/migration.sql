-- Nota de remessa opcional no pedido
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "notaRemessa" TEXT;
