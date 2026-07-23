/** Cliente de transação Prisma (tipagem frouxa para helpers compartilhados). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StockReservationTx = any;

export function orderNumberFromOrder(order: {
  code: string;
  externalOrderNumber?: string | null;
}): string {
  const ext = order.externalOrderNumber?.trim();
  return ext || order.code;
}

/** Cria ou reativa reserva da linha (única por orderItemId). */
export async function upsertStockReservation(
  tx: StockReservationTx,
  data: {
    orderId: string;
    orderItemId: string;
    productId: string;
    sku: string;
    quantity: number;
    orderNumber: string;
    createdById: string | null;
  },
) {
  const now = new Date();
  await tx.stockReservation.upsert({
    where: { orderItemId: data.orderItemId },
    create: {
      orderId: data.orderId,
      orderItemId: data.orderItemId,
      productId: data.productId,
      sku: data.sku,
      quantity: data.quantity,
      orderNumber: data.orderNumber,
      createdById: data.createdById,
      releasedAt: null,
    },
    update: {
      orderId: data.orderId,
      productId: data.productId,
      sku: data.sku,
      quantity: data.quantity,
      orderNumber: data.orderNumber,
      createdById: data.createdById,
      releasedAt: null,
      createdAt: now,
    },
  });
}

/** Libera reserva ativa da linha (histórico com releasedAt). */
export async function markStockReservationReleased(
  tx: StockReservationTx,
  reservationId: string,
) {
  await tx.stockReservation.update({
    where: { id: reservationId },
    data: { releasedAt: new Date() },
  });
}

export async function markOrderItemReservationReleased(
  tx: StockReservationTx,
  orderItemId: string,
) {
  await tx.stockReservation.updateMany({
    where: { orderItemId, releasedAt: null },
    data: { releasedAt: new Date() },
  });
}

export async function findActiveReservationByOrderItem(
  tx: StockReservationTx,
  orderItemId: string,
): Promise<{
  id: string;
  quantity: number;
  releasedAt: Date | null;
  productId: string;
  sku: string;
} | null> {
  const row = await tx.stockReservation.findUnique({
    where: { orderItemId },
  });
  if (!row || row.releasedAt) return null;
  return row;
}
