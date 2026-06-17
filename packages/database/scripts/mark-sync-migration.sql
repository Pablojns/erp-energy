INSERT INTO "_prisma_migrations" (
  id,
  checksum,
  finished_at,
  migration_name,
  logs,
  rolled_back_at,
  started_at,
  applied_steps_count
)
SELECT
  gen_random_uuid(),
  'b0d88ce9091f5dec2b69645f2c5757ebcdf1cc933b123d4a0ea0a0ce189e3fe2',
  NOW(),
  '20260610130000_sync_order_import_job_defaults',
  NULL,
  NULL,
  NOW(),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations"
  WHERE migration_name = '20260610130000_sync_order_import_job_defaults'
);
