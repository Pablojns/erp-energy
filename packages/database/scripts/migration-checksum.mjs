import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const path =
  'prisma/migrations/20260610130000_sync_order_import_job_defaults/migration.sql';
const content = readFileSync(path, 'utf8');
const checksum = createHash('sha256').update(content).digest('hex');
console.log(checksum);
