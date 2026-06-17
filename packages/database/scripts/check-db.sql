SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY finished_at;
SELECT column_name FROM information_schema.columns WHERE table_name = 'Order' AND column_name = 'obsExpedicao';
