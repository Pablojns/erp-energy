-- Tipos de movimentação específicos para ajustes de estoque (auditoria).
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'AJUSTE_QUANTIDADE';
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'AJUSTE_PRECO_VENDA';
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'AJUSTE_PRECO_BASE';
