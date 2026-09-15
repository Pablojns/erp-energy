-- Persistência de endereço estruturado no cadastro de fornecedor (busca CNPJ).
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "deliveryAddress" TEXT;
