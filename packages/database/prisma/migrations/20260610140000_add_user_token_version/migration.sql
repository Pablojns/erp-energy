-- Invalida tokens JWT antigos ao resetar senha ou inativar usuário.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
