-- Gravador terceirizado com o item (ex.: "Amanda").
-- Independente de supplierName: o produto pode ser XBZ/Ásia Imports e estar
-- fisicamente com o gravador. Aditivo e opcional: nenhum dado existente muda.
ALTER TABLE "PurchaseRequest" ADD COLUMN IF NOT EXISTS "engravingVendor" TEXT;
