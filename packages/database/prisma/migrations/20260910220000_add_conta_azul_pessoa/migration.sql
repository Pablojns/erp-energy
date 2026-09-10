CREATE TABLE IF NOT EXISTS "ContaAzulPessoa" (
  "id" UUID NOT NULL,
  "contaAzulId" TEXT NOT NULL,
  "documento" TEXT NOT NULL,
  "documentoDigits" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "tipoPessoa" TEXT,
  "perfis" TEXT NOT NULL DEFAULT '',
  "cep" TEXT,
  "logradouro" TEXT,
  "numero" TEXT,
  "complemento" TEXT,
  "bairro" TEXT,
  "cidade" TEXT,
  "uf" TEXT,
  "enderecoJson" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "syncedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContaAzulPessoa_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContaAzulPessoa_contaAzulId_key" ON "ContaAzulPessoa"("contaAzulId");
CREATE INDEX IF NOT EXISTS "ContaAzulPessoa_documentoDigits_idx" ON "ContaAzulPessoa"("documentoDigits");
CREATE INDEX IF NOT EXISTS "ContaAzulPessoa_nome_idx" ON "ContaAzulPessoa"("nome");
