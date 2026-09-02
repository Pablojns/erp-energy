-- URL da foto do catálogo persistida no card de Compras (busca XBZ/SPOT).
ALTER TABLE "PurchaseRequest" ADD COLUMN IF NOT EXISTS "productImageUrl" TEXT;
