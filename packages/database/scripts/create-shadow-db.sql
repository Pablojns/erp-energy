SELECT 'CREATE DATABASE erp_dev_shadow'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'erp_dev_shadow')\gexec
