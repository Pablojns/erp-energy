import { orderDisplayNumber } from '@/src/components/expedicao/shared/order-helpers';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import type { PedidoParaImpressao } from '@/src/utils/print-waybill';

export function mapOrderToPedidoParaImpressao(order: OrderDto): PedidoParaImpressao {
  return {
    id: order.id,
    numero: orderDisplayNumber(order),
    cliente: order.customerName,
    recebedor: order.receiverName?.trim() || undefined,
    pontoDescarga: order.unloadingPoint?.trim() || '—',
    dataEntrega:
      order.requestedDeliveryDate ??
      order.orderDate ??
      order.createdAt,
    itens: order.items.map((item) => ({
      sku: item.sku,
      descricao: item.description,
      quantidade: item.quantity,
    })),
  };
}
