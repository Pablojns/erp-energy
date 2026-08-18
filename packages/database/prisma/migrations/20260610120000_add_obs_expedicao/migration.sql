-- Observação interna da equipe de expedição (separada da observação WEG em notes)
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "obsExpedicao" TEXT;
