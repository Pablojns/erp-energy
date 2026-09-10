CREATE TABLE IF NOT EXISTS "ContaAzulSession" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "tokenType" TEXT NOT NULL DEFAULT 'Bearer',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContaAzulSession_pkey" PRIMARY KEY ("id")
);
