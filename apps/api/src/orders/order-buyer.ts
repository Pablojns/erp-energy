/** Relação enxuta do Cliente para exibir o comprador ao vivo no pedido. */
export const ORDER_BUYER_CUSTOMER_SELECT = {
  name: true,
  document: true,
  deliveryAddress: true,
} as const;

export type OrderBuyerCustomer = {
  name?: string | null;
  document?: string | null;
  deliveryAddress?: string | null;
} | null;

/**
 * Comprador do pedido: se há Customer vinculado, usa o cadastro atual.
 * Order.customerName / document / address ficam só como fallback.
 */
export function resolveOrderBuyerFields(order: {
  customerName: string;
  customerDocument?: string | null;
  deliveryAddress?: string | null;
  customer?: OrderBuyerCustomer;
}): {
  customerName: string;
  customerDocument: string | null;
  deliveryAddress: string | null;
} {
  const liveName = order.customer?.name?.trim() || '';
  const liveDocument = order.customer?.document?.trim() || '';
  const liveAddress = order.customer?.deliveryAddress?.trim() || '';
  return {
    customerName: liveName || order.customerName,
    customerDocument: liveDocument || order.customerDocument?.trim() || null,
    deliveryAddress: order.deliveryAddress?.trim() || liveAddress || null,
  };
}
