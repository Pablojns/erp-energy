'use client';

import { useMemo, useState, type ReactNode, type RefObject } from 'react';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { formatCpfCnpj } from '@/src/components/cadastros/document-mask';
import {
  OrderItemOrderedQtyCell,
  OrderItemStockAvailableCell,
  OrderItemStockOnHandCell,
  OrderItemStockReservedCell,
} from '@/src/components/expedicao/workspace/order-item-stock-cells';
import {
  displayOrDash,
  orderDisplayNumber,
  splitOrdersPartialFirst,
} from '@/src/components/expedicao/shared/order-helpers';
import {
  EMPTY_ITEM_STOCK,
  useOrderItemsStock,
} from '@/src/components/expedicao/shared/use-order-items-stock';
import type { OrderDto, OrderSource } from '@/src/components/expedicao/shared/types';
import type { useExpeditionPedidosBridge } from '@/src/hooks/useExpeditionPedidosBridge';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function formatCurrency(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return brl.format(Number.isFinite(n) ? n : 0);
}

function formatFullDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

function sourceLabel(source: OrderSource): string {
  if (source === 'WEG_MERCADO_ELETRONICO') return 'WEG';
  if (source === 'SITE') return 'SITE';
  if (source === 'VENDA_EXTERNA') return 'Venda Externa';
  if (source === 'ECOMMERCE') return 'E-commerce';
  return 'Manual';
}

function formatBuyerCnpj(order: OrderDto): string {
  const raw = (order.customerDocument || order.deliveryCnpj || '').trim();
  if (!raw) return '—';
  const formatted = formatCpfCnpj(raw);
  if (!formatted) return '—';
  const digits = raw.replace(/\D/g, '');
  const label = digits.length === 11 ? 'CPF' : 'CNPJ';
  return `${label} ${formatted}`;
}

function originOrCarrier(order: OrderDto): string {
  const origin = sourceLabel(order.source);
  const carrier = order.carrierName?.trim();
  if (carrier && carrier.toUpperCase() !== origin.toUpperCase()) {
    return `${origin} · ${carrier}`;
  }
  return origin;
}

export type PedidosViewMode = 'compact' | 'items';

export function PedidosViewToggle(props: {
  value: PedidosViewMode;
  onChange: (value: PedidosViewMode) => void;
}) {
  const { value, onChange } = props;
  return (
    <div className="exp-pedidos-view-toggle" role="group" aria-label="Modo de visualização">
      <button
        type="button"
        className={`exp-pedidos-view-toggle-btn${value === 'compact' ? ' is-active' : ''}`}
        aria-pressed={value === 'compact'}
        onClick={() => onChange('compact')}
      >
        Visualização Compacta
      </button>
      <button
        type="button"
        className={`exp-pedidos-view-toggle-btn${value === 'items' ? ' is-active' : ''}`}
        aria-pressed={value === 'items'}
        onClick={() => onChange('items')}
      >
        Visualização por Item
      </button>
    </div>
  );
}

function canSendToSeparation(order: OrderDto): boolean {
  return (
    order.status === 'NOVO' ||
    order.status === 'PARCIAL' ||
    order.status === 'RESERVADO' ||
    (order.status as string) === 'PENDENTE'
  );
}

type OrdersData = ReturnType<typeof useExpeditionPedidosBridge>;

export function PedidosItemsExpandedList(props: {
  orders: OrderDto[];
  data: OrdersData;
  selectedOrderId: string | null;
  onSelectOrder: (id: string) => void;
  onOrderChosen?: () => void;
  selectedForPrintIds?: Set<string>;
  onTogglePrint?: (orderId: string) => void;
  isAdmin?: boolean;
  onEditOrder?: (order: OrderDto) => void;
  onDeleteOrder?: (order: OrderDto) => void;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  listFooter?: ReactNode;
}) {
  const {
    orders,
    data,
    selectedOrderId,
    onSelectOrder,
    onOrderChosen,
    selectedForPrintIds,
    onTogglePrint,
    onEditOrder,
    onDeleteOrder,
    scrollContainerRef,
    listFooter,
  } = props;

  const [sendingId, setSendingId] = useState<string | null>(null);
  const allItems = useMemo(
    () => orders.flatMap((order) => order.items ?? []),
    [orders],
  );
  const stockByItemId = useOrderItemsStock(allItems);
  const { partial, fresh } = splitOrdersPartialFirst(orders);
  const hasActions = Boolean(onEditOrder || onDeleteOrder || data.sendToPicking);

  const handleSend = async (order: OrderDto) => {
    setSendingId(order.id);
    try {
      await data.sendToPicking(order.id);
    } finally {
      setSendingId(null);
    }
  };

  const renderSection = (
    key: string,
    title: string,
    rows: OrderDto[],
    variant: 'partial' | 'fresh',
  ) => {
    if (rows.length === 0) return null;
    return (
      <section
        key={key}
        className={`exp-pedidos-expanded-section exp-pedidos-expanded-section--${variant}`}
      >
        <div className="exp-queue-section-title">
          {title}
          <span className="exp-queue-section-count">{rows.length}</span>
        </div>
        <div className="exp-pedidos-expanded-list">
          {rows.map((order) => {
            const selected = selectedOrderId === order.id;
            const sending = sendingId === order.id;
            const items = order.items ?? [];
            return (
              <article
                key={order.id}
                className={`exp-pedidos-expanded-block${selected ? ' exp-pedidos-expanded-block--selected' : ''}${
                  variant === 'partial' ? ' exp-pedidos-expanded-block--partial' : ''
                }`}
              >
                <header
                  className="exp-pedidos-expanded-head"
                  onClick={() => {
                    onSelectOrder(order.id);
                    onOrderChosen?.();
                  }}
                >
                  {onTogglePrint ? (
                    <label
                      className="exp-pedidos-expanded-check"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className="exp-pedidos-check"
                        checked={selectedForPrintIds?.has(order.id) ?? false}
                        onChange={() => onTogglePrint(order.id)}
                        aria-label={`Selecionar pedido ${orderDisplayNumber(order)}`}
                      />
                    </label>
                  ) : null}
                  <p className="exp-pedidos-expanded-meta">
                    <span className="exp-pedidos-expanded-number">
                      #{orderDisplayNumber(order)}
                    </span>
                    <span aria-hidden> · </span>
                    <span>{originOrCarrier(order)}</span>
                    <span aria-hidden> · </span>
                    <span>{formatFullDate(order.orderDate)}</span>
                    <span aria-hidden> · </span>
                    <span>{formatBuyerCnpj(order)}</span>
                    <span aria-hidden> · </span>
                    <span className="exp-pedidos-expanded-total">
                      {formatCurrency(order.totalValue)}
                    </span>
                  </p>
                  {hasActions ? (
                    <div
                      className="exp-pedidos-expanded-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {canSendToSeparation(order) ? (
                        <button
                          type="button"
                          className="exp-pedidos-expanded-send"
                          disabled={sending}
                          onClick={() => void handleSend(order)}
                        >
                          {sending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : null}
                          Enviar p/ Separação
                        </button>
                      ) : null}
                      {onEditOrder ? (
                        <button
                          type="button"
                          className="exp-pedidos-action-btn"
                          aria-label="Editar pedido"
                          onClick={() => onEditOrder(order)}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                          <span>Editar</span>
                        </button>
                      ) : null}
                      {onDeleteOrder ? (
                        <button
                          type="button"
                          className="exp-pedidos-action-btn exp-pedidos-action-btn--danger"
                          aria-label="Excluir pedido"
                          onClick={() => onDeleteOrder(order)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </header>
                <ul className="exp-pedidos-expanded-items">
                  {items.length === 0 ? (
                    <li className="exp-pedidos-expanded-item exp-pedidos-expanded-item--empty">
                      Sem itens neste pedido
                    </li>
                  ) : (
                    items.map((item) => {
                      const stock = stockByItemId[item.id] ?? EMPTY_ITEM_STOCK;
                      return (
                        <li key={item.id} className="exp-pedidos-expanded-item">
                          <span className="exp-pedidos-expanded-sku" title={item.sku}>
                            {displayOrDash(item.sku)}
                          </span>
                          <span
                            className="exp-pedidos-expanded-name"
                            title={item.description}
                          >
                            {item.description || '—'}
                          </span>
                          <span className="exp-pedidos-expanded-fig">
                            <span className="exp-pedidos-expanded-fig-label">Qtd</span>
                            <OrderItemOrderedQtyCell qty={item.quantity} />
                          </span>
                          <span className="exp-pedidos-expanded-fig">
                            <span className="exp-pedidos-expanded-fig-label">Estoque</span>
                            <OrderItemStockOnHandCell stock={stock} />
                          </span>
                          <span className="exp-pedidos-expanded-fig">
                            <span className="exp-pedidos-expanded-fig-label">Reservado</span>
                            <OrderItemStockReservedCell stock={stock} />
                          </span>
                          <span className="exp-pedidos-expanded-fig">
                            <span className="exp-pedidos-expanded-fig-label">Disponível</span>
                            <OrderItemStockAvailableCell
                              orderedQty={item.quantity}
                              stock={stock}
                            />
                          </span>
                        </li>
                      );
                    })
                  )}
                </ul>
              </article>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div className="exp-pedidos-expanded-wrap flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div
        ref={scrollContainerRef}
        className="exp-pedidos-table-scroll erp-scrollbar overflow-x-hidden"
      >
        {renderSection('partial', 'Pedidos Parciais (retomar)', partial, 'partial')}
        {renderSection('fresh', 'Novos Pedidos', fresh, 'fresh')}
        {listFooter}
      </div>
    </div>
  );
}
