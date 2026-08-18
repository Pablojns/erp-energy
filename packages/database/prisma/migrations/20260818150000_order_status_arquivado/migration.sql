-- Pedidos históricos fora das filas operacionais (auditoria).
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'ARQUIVADO';
