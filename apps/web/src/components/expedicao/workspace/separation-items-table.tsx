'use client';

import { useEffect } from 'react';
import { Lock } from 'lucide-react';
import { EMPTY_ITEM_STOCK, useOrderItemsStock } from '@/src/components/expedicao/shared/use-order-items-stock';
import {
  OrderItemOrderedQtyCell,
  OrderItemStockAvailableCell,
  OrderItemStockOnHandCell,
  OrderItemStockReservedCell,
} from '@/src/components/expedicao/workspace/order-item-stock-cells';
import { SeparationItemRow } from '@/src/components/expedicao/workspace/separation-item-row';
import {
  OrderItemOriginBadge,
  orderItemOrigin,
} from '@/src/components/expedicao/workspace/order-item-origin-badge';
import {
  formatOrderItemSaleValue,
  summarizeItemReceiptStatus,
  resolveLineSeparationStatus,
} from '@/src/components/expedicao/shared/order-helpers';
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

  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && !isOrdersMode) {
      console.log('itens separacao:', order.items);
    }
  }, [isOrdersMode, order.id, order.items]);

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
          className={`exp-wb-table exp-wb-table--compact exp-wb-table--mobile-cards w-full ${isOrdersMode ? 'exp-wb-table--orders' : 'exp-wb-table--separation'}`}
        >
          <colgroup>
            {isOrdersMode ? (
              <>
                <col className="exp-wb-col-linha" />
                <col className="exp-wb-col-sku" />
                <col className="exp-wb-col-item" />
                <col className="exp-wb-col-qtd-pedida" />
                <col className="exp-wb-col-qtd-sep" />
                <col className="exp-wb-col-qtd-falta" />
                {!isVendaExterna ? <col className="exp-wb-col-estoque-real" /> : null}
                {!isVendaExterna ? <col className="exp-wb-col-estoque-reservado" /> : null}
                {!isVendaExterna ? <col className="exp-wb-col-estoque-disp" /> : null}
                <col className="exp-wb-col-venda" />
                <col className="exp-wb-col-total-venda" />
                {!isVendaExterna ? <col className="exp-wb-col-item-status" /> : null}
              </>
            ) : (
              <>
                <col className="exp-wb-col-linha" />
                <col className="exp-wb-col-sku" />
                <col className="exp-wb-col-item" />
                <col className="exp-wb-col-qtd-pedida" />
                {!isVendaExterna ? <col className="exp-wb-col-estoque-real" /> : null}
                {!isVendaExterna ? <col className="exp-wb-col-estoque-reservado" /> : null}
                {!isVendaExterna ? <col className="exp-wb-col-estoque-disp" /> : null}
                <col className="exp-wb-col-sep-qty" />
                <col className="exp-wb-col-preco" />
                <col className="exp-wb-col-total" />
                <col className="exp-wb-col-status" />
                <col className="exp-wb-col-action" />
              </>
            )}
          </colgroup>
          <thead>
            <tr>
              {isOrdersMode ? (
                <>
                  <th>Linha</th>
                  <th>SKU</th>
                  <th>Item</th>
                  <th className="exp-wb-th-num exp-wb-num-qtd">Qtd Pedido</th>
                  <th className="exp-wb-th-num exp-wb-num-sep">Qtd Separada</th>
                  <th className="exp-wb-th-num exp-wb-num-falta">Falta</th>
                  {!isVendaExterna ? (
                    <th className="exp-wb-th-num exp-wb-num-real">Estoque Real</th>
                  ) : null}
                  {!isVendaExterna ? (
                    <th className="exp-wb-th-num exp-wb-num-reservado">Reservado</th>
                  ) : null}
                  {!isVendaExterna ? (
                    <th className="exp-wb-th-num exp-wb-num-disp">Estoque Disponível</th>
                  ) : null}
                  <th className="exp-wb-th-num exp-wb-num-venda">Venda unit.</th>
                  <th className="exp-wb-th-num exp-wb-num-total">Total venda</th>
                  {!isVendaExterna ? <th className="text-center">Status item</th> : null}
                </>
              ) : (
                <>
                  <th style={{ whiteSpace: 'nowrap' }}>Linha</th>
                  <th style={{ whiteSpace: 'nowrap' }}>SKU</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Item</th>
                  <th className="exp-wb-th-num exp-wb-num-qtd">Qtd Pedido</th>
                  {!isVendaExterna ? (
                    <th className="exp-wb-th-num exp-wb-num-real">Estoque Real</th>
                  ) : null}
                  {!isVendaExterna ? (
                    <th className="exp-wb-th-num exp-wb-num-reservado">Reservado</th>
                  ) : null}
                  {!isVendaExterna ? (
                    <th className="exp-wb-th-num exp-wb-num-disp">Estoque Disponível</th>
                  ) : null}
                  <th className="text-center" style={{ whiteSpace: 'nowrap' }}>
                    Qtd Sep.
                  </th>
                  <th className="text-center" style={{ whiteSpace: 'nowrap' }}>
                    Preço Unit.
                  </th>
                  <th className="text-center" style={{ whiteSpace: 'nowrap' }}>
                    Total
                  </th>
                  <th className="text-center" style={{ whiteSpace: 'nowrap' }}>
                    Status
                  </th>
                  <th className="text-center" style={{ whiteSpace: 'nowrap' }}>
                    Ação
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => {
              const stock = stockByItemId[it.id] ?? EMPTY_ITEM_STOCK;
              const lineStatus = resolveLineSeparationStatus(it);
              const picked = lineStatus.picked;
              const missing = lineStatus.missing;

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
                  <td className="exp-wb-cell-item text-xs" data-label="Item">
                    <span className="inline-flex items-center gap-1.5">
                      {it.description}
                      <OrderItemOriginBadge origin={orderItemOrigin(it)} />
                    </span>
                  </td>
                  <td className="exp-wb-td-num exp-wb-num-qtd" data-label="Qtd Pedido">
                    <OrderItemOrderedQtyCell qty={it.quantity} />
                  </td>
                  <td className="exp-wb-td-num exp-wb-num-sep text-xs font-semibold" data-label="Qtd Separada">
                    {picked}
                  </td>
                  <td
                    className={`exp-wb-td-num exp-wb-num-falta text-xs font-semibold ${missing > 0 ? 'text-amber-600' : 'text-emerald-600'}`}
                    data-label="Falta"
                  >
                    {missing}
                  </td>
                  {!isVendaExterna ? (
                    <>
                      <td className="exp-wb-td-num exp-wb-num-real" data-label="Estoque Real">
                        <OrderItemStockOnHandCell stock={stock} />
                      </td>
                      <td className="exp-wb-td-num exp-wb-num-reservado" data-label="Reservado">
                        <OrderItemStockReservedCell stock={stock} />
                      </td>
                      <td className="exp-wb-td-num exp-wb-num-disp" data-label="Estoque Disponível">
                        <OrderItemStockAvailableCell orderedQty={it.quantity} stock={stock} />
                      </td>
                    </>
                  ) : null}
                  <td className="exp-wb-td-num exp-wb-num-venda text-xs" data-label="Venda unit.">
                    {formatOrderItemSaleValue(it.unitPrice)}
                  </td>
                  <td className="exp-wb-td-num exp-wb-num-total text-xs" data-label="Total venda">
                    {formatOrderItemSaleValue(
                      it.totalPrice,
                      it.unitPrice,
                      it.quantity,
                    )}
                  </td>
                  {!isVendaExterna ? (
                    <td className="text-center" data-label="Status item">
                      <span
                        className={`exp-wb-line-status exp-wb-line-status--${
                          lineStatus.label === 'PARCIAL' ? 'parcial' : 'completo'
                        } text-xs`}
                      >
                        {lineStatus.label}
                      </span>
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
