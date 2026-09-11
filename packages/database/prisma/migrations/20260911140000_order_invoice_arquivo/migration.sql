ALTER TABLE "OrderInvoiceHistory" ADD COLUMN IF NOT EXISTS "xmlStorageKey" TEXT;
ALTER TABLE "OrderInvoiceHistory" ADD COLUMN IF NOT EXISTS "danfeStorageKey" TEXT;
