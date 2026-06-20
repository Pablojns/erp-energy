'use client';

import { useOrderItemsStock } from '@/src/components/expedicao/shared/use-order-items-stock';
import {
  OrderItemOrderedQtyCell,
  OrderItemStockQtyCell,
} from '@/src/components/expedicao/workspace/order-item-stock-cells';
import { SeparationItemRow } from '@/src/components/expedicao/workspace/separation-item-row';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import type { useExpeditionPedidosBridge } from '@/src/hooks/useExpeditionPedidosBridge';

type OrdersData = ReturnType<typeof useExpeditionPedidosBridge>;

export function SeparationItemsTable(props: {
  order: OrderDto;
  data: OrdersData;
  mode?: 'orders' | 'separation';
  onAfterAction?: () => void;
}) {
  const { order, data, mode = 'separation', onAfterAction } = props;
  const isOrdersMode = mode === 'orders';
  const stockByItemId = useOrderItemsStock(order.items);

  return (
    <div className="exp-wb-table-wrap">
      <div className="exp-wb-table-head">
        <h3>{isOrdersMode ? 'Itens do pedido (leitura)' : 'Itens para separação'}</h3>
      </div>
      <div className="exp-wb-table-scroll">
        <table
          className={`exp-wb-table ${isOrdersMode ? 'exp-wb-table--orders' : 'exp-wb-table--separation'}`}
        >
          <colgroup>
            <col className="exp-wb-col-linha" />
            <col className="exp-wb-col-sku" />
            <col className="exp-wb-col-item" />
            <col className="exp-wb-col-qtd-pedida" />
            <col className="exp-wb-col-qtd-estoque" />
            {!isOrdersMode ? <col className="exp-wb-col-sep-qty" /> : null}
            {!isOrdersMode ? <col className="exp-wb-col-status" /> : null}
            {!isOrdersMode ? <col className="exp-wb-col-action" /> : null}
          </colgroup>
          <thead>
            <tr>
              <th>Linha</th>
              <th>SKU</th>
              <th>Item</th>
              <th className="text-center">Qtd</th>
              <th className="text-center">Qtd Estoque</th>
              {!isOrdersMode ? <th className="text-center">Qtd. separada</th> : null}
              {!isOrdersMode ? <th className="text-center">Status</th> : null}
              {!isOrdersMode ? <th className="text-center">Ação</th> : null}
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => {
              const stock = stockByItemId[it.id] ?? { available: null, loading: true };

              if (!isOrdersMode) {
                return (
                  <SeparationItemRow
                    key={it.id}
                    order={order}
                    item={it}
                    stock={stock}
                    onConfirmLine={async (qty) => {
                      await data.markLineSeparated(order.id, it.id, qty);
                      onAfterAction?.();
                    }}
                  />
                );
              }

              return (
                <tr key={it.id}>
                  <td className="exp-wb-cell-linha">{it.lineNumber}</td>
                  <td className="exp-wb-cell-sku">{it.sku}</td>
                  <td className="exp-wb-cell-item" title={it.description}>
                    {it.description}
                  </td>
                  <td className="text-center">
                    <OrderItemOrderedQtyCell qty={it.quantity} />
                  </td>
                  <td className="text-center">
                    <OrderItemStockQtyCell orderedQty={it.quantity} stock={stock} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
