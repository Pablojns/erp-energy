-- Etapas customizáveis do Kanban de Compras (mesmo padrão de CrmFunil).
CREATE TABLE IF NOT EXISTS "PurchaseStage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "color" TEXT,
    "requiresPurchaseDetails" BOOLEAN NOT NULL DEFAULT false,
    "requiresReason" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseStage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PurchaseStage_order_idx" ON "PurchaseStage"("order");

-- As 8 etapas atuais viram registros iniciais, na mesma ordem.
-- Os ids reproduzem os valores de status já gravados em PurchaseRequest.status,
-- então os dados existentes já apontam para a etapa correta (migração sem UPDATE).
INSERT INTO "PurchaseStage" ("id", "name", "order", "color", "requiresPurchaseDetails", "requiresReason")
VALUES
    ('SOLICITADO', 'Requisição de Compra', 0, '#6366f1', false, false),
    ('PEDIDO_ENVIADO_APROVADO', 'Pedido Enviado/Aprovado', 1, '#3b82f6', true, false),
    ('PEDIDO_PAGO', 'Pedido Pago', 2, '#0ea5e9', false, false),
    ('LAYOUT_APROVADO', 'Layout Aprovado', 3, '#f59e0b', false, false),
    ('EM_PRODUCAO', 'Em Produção', 4, '#84cc16', false, false),
    ('EXPEDIDO', 'Expedido', 5, '#10b981', false, false),
    ('RECEBIDO', 'Recebido', 6, '#22c55e', false, false),
    ('RECUSADO', 'Finalizados', 7, '#71717a', false, false)
ON CONFLICT ("id") DO NOTHING;
