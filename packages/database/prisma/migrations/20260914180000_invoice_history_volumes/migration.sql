-- Volumes por NF no histórico e na saída do ciclo (ERP ou XML).
ALTER TABLE "OrderInvoiceHistory" ADD COLUMN IF NOT EXISTS "volumes" INTEGER;
ALTER TABLE "OrderExit" ADD COLUMN IF NOT EXISTS "volumes" INTEGER;
