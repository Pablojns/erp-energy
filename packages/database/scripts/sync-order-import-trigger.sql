-- Campos para log de importação WEG (manual / automática / agendada)
DO $$ BEGIN
  CREATE TYPE "OrderImportTrigger" AS ENUM ('MANUAL', 'AUTOMATIC', 'SCHEDULED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "OrderImportJob"
  ADD COLUMN IF NOT EXISTS "trigger" "OrderImportTrigger" NOT NULL DEFAULT 'MANUAL';

ALTER TABLE "OrderImportJob"
  ADD COLUMN IF NOT EXISTS "fileName" TEXT;

CREATE INDEX IF NOT EXISTS "OrderImportJob_trigger_idx" ON "OrderImportJob" ("trigger");
CREATE INDEX IF NOT EXISTS "OrderImportJob_createdAt_idx" ON "OrderImportJob" ("createdAt");
