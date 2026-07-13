'use client';

import { Lock } from 'lucide-react';
import { useOrderItemsStock } from '@/src/components/expedicao/shared/use-order-items-stock';
import {
  OrderItemOrderedQtyCell,
  OrderItemStockQtyCell,
} from '@/src/components/expedicao/workspace/order-item-stock-cells';
import { OrderItemReceiptStatusBadge } from '@/src/components/expedicao/workspace/order-item-receipt-status-badge';
import { SeparationItemRow } from '@/src/components/expedicao/workspace/separation-item-row';
import { summarizeItemReceiptStatus, resolveItemReceiptStatusForOrder } from '@/src/components/expedicao/shared/order-helpers';
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
  const isVendaExterna = order.source === 'VENDA_EXTERNA';
  const stockByItemId = useOrderItemsStock(order.items);
  const receiptSummary = summarizeItemReceiptStatus(order.items);

  return (
    <div className="exp-wb-table-wrap">
      <div className="exp-wb-table-head exp-wb-table-head--compact">
        {isOrdersMode ? (
          <span
            className="exp-wb-table-head-lock"
            title="Itens do pedido (somente leitura)"
            aria-label="Itens do pedido (somente leitura)"
          >
            <Lock className="h-3 w-3" aria-hidden />
          </span>
        ) : (
          <h3 className="exp-wb-table-head-title">Itens para separação</h3>
        )}
        {isOrdersMode && receiptSummary.recebidos + receiptSummary.emFalta > 0 ? (
          <p className="exp-wb-item-receipt-summary text-[10px]">
            <span className="exp-wb-item-receipt-summary__recebido">
              {receiptSummary.recebidos} recebido(s)
            </span>
            {' · '}
            <span className="exp-wb-item-receipt-summary__falta">
              {receiptSummary.emFalta} em falta
            </span>
          </p>
        ) : null}
      </div>
      <div className="exp-wb-table-scroll">
        <table
          className={`exp-wb-table exp-wb-table--compact exp-wb-table--mobile-cards ${isOrdersMode ? 'exp-wb-table--orders' : 'exp-wb-table--separation'}`}
        >
          <colgroup>
            <col className="exp-wb-col-linha" />
            <col className="exp-wb-col-sku" />
            <col className="exp-wb-col-item" />
            <col className="exp-wb-col-qtd-pedida" />
            {!isOrdersMode ? <col /> : null}
            {!isVendaExterna ? <col className="exp-wb-col-qtd-estoque" /> : null}
            {isOrdersMode && isVendaExterna ? <col /> : null}
            {isOrdersMode && isVendaExterna ? <col /> : null}
            {isOrdersMode && !isVendaExterna ? <col className="exp-wb-col-item-status" /> : null}
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
              {!isOrdersMode ? <th className="text-center">Qtd Sep.</th> : null}
              {!isVendaExterna ? <th className="text-center">Qtd Estoque</th> : null}
              {isOrdersMode && isVendaExterna ? (
                <th className="text-center">Preço unit.</th>
              ) : null}
              {isOrdersMode && isVendaExterna ? (
                <th className="text-center">Total</th>
              ) : null}
              {isOrdersMode && !isVendaExterna ? (
                <th className="text-center">Status item</th>
              ) : null}
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
                    hideStockColumn={isVendaExterna}
                    onConfirmLine={async (qty) => {
                      await data.markLineSeparated(order.id, it.id, qty);
                      onAfterAction?.();
                    }}
                  />
                );
              }

              return (
                <tr key={it.id}>
                  <td className="exp-wb-cell-linha text-xs" data-label="Linha">{it.lineNumber}</td>
                  <td className="exp-wb-cell-sku text-xs" data-label="SKU">{it.sku || '—'}</td>
                  <td className="exp-wb-cell-item text-xs" data-label="Item" title={it.description}>
                    {it.description}
                  </td>
                  <td className="text-center" data-label="Qtd">
                    <OrderItemOrderedQtyCell qty={it.quantity} />
                  </td>
                  {!isVendaExterna ? (
                    <td className="text-center" data-label="Estoque">
                      <OrderItemStockQtyCell orderedQty={it.quantity} stock={stock} />
                    </td>
                  ) : null}
                  {isVendaExterna ? (
                    <td className="text-center text-xs" data-label="Preço unit.">
                      {Number(it.unitPrice).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </td>
                  ) : null}
                  {isVendaExterna ? (
                    <td className="text-center text-xs" data-label="Total">
                      {Number(it.totalPrice).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </td>
                  ) : null}
                  {!isVendaExterna ? (
                    <td className="text-center" data-label="Status item">
                      <OrderItemReceiptStatusBadge
                        status={resolveItemReceiptStatusForOrder(it, order.status)}
                      />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
