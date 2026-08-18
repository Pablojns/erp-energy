-- Quantidade de volumes para expedição
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "volumes" INTEGER;
