-- Status por linha da planilha WEG (coluna "Status Item")
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "mercadoEletronicoItemStatus" TEXT;
