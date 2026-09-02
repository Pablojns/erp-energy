import type { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService['client'];

/**
 * Etapas padrão do Kanban de Compras.
 *
 * Os ids são os valores de status legados gravados em PurchaseRequest.status,
 * de forma que os registros existentes já referenciam a etapa correta e as
 * regras que dependem de etapas específicas (notificações por etapa, filtro de
 * atraso no cron, sync WEG) continuam valendo sem tradução.
 */
export const DEFAULT_PURCHASE_STAGES = [
  {
    id: 'SOLICITADO',
    name: 'Requisição de Compra',
    order: 0,
    color: '#6366f1',
    requiresPurchaseDetails: false,
    requiresReason: false,
  },
  {
    id: 'PEDIDO_ENVIADO_APROVADO',
    name: 'Pedido Enviado/Aprovado',
    order: 1,
    color: '#3b82f6',
    requiresPurchaseDetails: true,
    requiresReason: false,
  },
  {
    id: 'PEDIDO_PAGO',
    name: 'Pedido Pago',
    order: 2,
    color: '#0ea5e9',
    requiresPurchaseDetails: false,
    requiresReason: false,
  },
  {
    id: 'LAYOUT_APROVADO',
    name: 'Layout Aprovado',
    order: 3,
    color: '#f59e0b',
    requiresPurchaseDetails: false,
    requiresReason: false,
  },
  {
    id: 'EM_PRODUCAO',
    name: 'Em Produção',
    order: 4,
    color: '#84cc16',
    requiresPurchaseDetails: false,
    requiresReason: false,
  },
  {
    id: 'EXPEDIDO',
    name: 'Expedido',
    order: 5,
    color: '#10b981',
    requiresPurchaseDetails: false,
    requiresReason: false,
  },
  {
    id: 'RECEBIDO',
    name: 'Recebido',
    order: 6,
    color: '#22c55e',
    requiresPurchaseDetails: false,
    requiresReason: false,
  },
  {
    id: 'RECUSADO',
    name: 'Finalizados',
    order: 7,
    color: '#71717a',
    requiresPurchaseDetails: false,
    requiresReason: false,
  },
] as const;

/** Etapa inicial de toda nova solicitação. */
export const DEFAULT_PURCHASE_STAGE_ID = 'SOLICITADO';

/**
 * Etapa que representa o antigo status COMPRADO no Kanban.
 * O endpoint legado PATCH /:id/comprado continua gravando 'COMPRADO'.
 */
export const PURCHASE_COMPRADO_STAGE_ID = 'PEDIDO_ENVIADO_APROVADO';

/**
 * Cria as etapas padrão que ainda não existem.
 *
 * Idempotente e não-destrutivo: se a etapa já existe, nada é sobrescrito —
 * renomeações, cores e reordenações feitas pelo admin são preservadas.
 */
export async function ensureDefaultPurchaseStages(client: Db) {
  for (const stage of DEFAULT_PURCHASE_STAGES) {
    const existing = await client.purchaseStage.findUnique({
      where: { id: stage.id },
      select: { id: true },
    });
    if (existing) continue;

    await client.purchaseStage.create({
      data: {
        id: stage.id,
        name: stage.name,
        order: stage.order,
        color: stage.color,
        requiresPurchaseDetails: stage.requiresPurchaseDetails,
        requiresReason: stage.requiresReason,
      },
    });
  }
}
