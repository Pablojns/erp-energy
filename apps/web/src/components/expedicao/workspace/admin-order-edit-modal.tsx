'use client';

import { useEffect, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { formatDeliveryAddressDisplay } from '@/src/components/cadastros/delivery-address';
import { canEditSiteOrderItems } from '@/src/components/expedicao/shared/order-helpers';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import {
  InventoryProductPickerModal,
  type InventoryProductOption,
} from '@/src/components/expedicao/workspace/inventory-product-picker-modal';
import { PremiumSelect } from '@/src/components/ui/premium-select';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { numeroPedFromOrder, pedidoApiUrl } from '@/src/services/api/pedidos-normalize';

const ORDER_STATUSES = [
  'NOVO',
  'ANALISADO',
  'PARCIAL',
  'RESERVADO',
  'EM_SEPARACAO',
  'SEPARADO',
  'AGUARDANDO_NF',
  'NF_ATRELADA',
  'EXPEDIDO',
  'FINALIZADO',
  'CANCELADO',
] as const;

const ITEM_STATUS_OPTIONS = ['', 'Recebido', 'Em falta'];

type CarrierOption = { id: string; name: string; isActive: boolean };

type EditItemRow = {
  id: string;
  lineNumber: number;
  productId: string;
  sku: string;
  description: string;
  quantity: string;
  unitPrice: string;
  mercadoEletronicoItemStatus: string;
};

function fieldClass() {
  return 'w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]';
}

function readOnlyFieldClass() {
  return `${fieldClass()} cursor-default bg-[var(--bg-card)] text-[var(--text-secondary)] focus:ring-0`;
}

export function AdminOrderEditModal(props: {
  isOpen: boolean;
  order: OrderDto | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { isOpen, order, onClose, onSaved } = props;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [carriers, setCarriers] = useState<CarrierOption[]>([]);

  const [receiverName, setReceiverName] = useState('');
  const [unloadingPoint, setUnloadingPoint] = useState('');
  const [deliveryCnpj, setDeliveryCnpj] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [obsExpedicao, setObsExpedicao] = useState('');
  const [status, setStatus] = useState('NOVO');
  const [priority, setPriority] = useState('3');
  const [mercadoEletronicoStatus, setMercadoEletronicoStatus] = useState('');
  const [contaAzulStatus, setContaAzulStatus] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [totalValue, setTotalValue] = useState('');
  const [carrierId, setCarrierId] = useState('');
  const [items, setItems] = useState<EditItemRow[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickingIndex, setPickingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    void erpFetchJson<CarrierOption[]>('cadastros/carriers')
      .then((rows) => setCarriers(rows.filter((c) => c.isActive)))
      .catch(() => setCarriers([]));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !order) return;
    setReceiverName(order.receiverName ?? '');
    setUnloadingPoint(order.unloadingPoint ?? '');
    setDeliveryCnpj(order.deliveryCnpj ?? order.customerDocument ?? '');
    setOrderDate(order.orderDate?.slice(0, 10) ?? '');
    setRequestedDeliveryDate(order.requestedDeliveryDate?.slice(0, 10) ?? '');
    setNotes(order.notes ?? '');
    setObsExpedicao(order.obsExpedicao ?? '');
    setStatus(order.status);
    setPriority(String(order.priority));
    setMercadoEletronicoStatus(order.mercadoEletronicoStatus ?? '');
    setContaAzulStatus(order.contaAzulStatus ?? '');
    setInvoiceNumber(order.invoiceNumber ?? '');
    setTotalValue(order.totalValue ?? '');
    setCarrierId(order.carrierId ?? '');
    setItems(
      order.items.map((it) => ({
        id: it.id,
        lineNumber: it.lineNumber,
        productId: it.productId ?? '',
        sku: it.sku,
        description: it.description,
        quantity: String(it.quantity),
        unitPrice: it.unitPrice ?? '0',
        mercadoEletronicoItemStatus: it.mercadoEletronicoItemStatus ?? '',
      })),
    );
    setError(null);
    setPickerOpen(false);
    setPickingIndex(null);
  }, [isOpen, order]);

  if (!isOpen || !order) return null;

  const numeroPed = numeroPedFromOrder(order);
  if (!numeroPed) return null;

  const isSiteOrder = order.source === 'SITE';
  const siteItemsEditable = canEditSiteOrderItems(order, 'orders');
  const isSimpleCustomerLayout =
    isSiteOrder || order.source === 'VENDA_EXTERNA';
  const orderNumberDisplay = order.externalOrderNumber ?? order.code;
  const deliveryAddressDisplay = formatDeliveryAddressDisplay(
    order.deliveryAddress ?? order.unloadingPoint,
  );
  const busy = saving;

  const openPickerFor = (idx: number) => {
    if (!siteItemsEditable) return;
    setPickingIndex(idx);
    setPickerOpen(true);
    setError(null);
  };

  const handleInventorySelect = (product: InventoryProductOption) => {
    if (pickingIndex == null) return;
    setItems((prev) => {
      const next = [...prev];
      const current = next[pickingIndex];
      if (!current) return prev;
      next[pickingIndex] = {
        ...current,
        productId: product.id,
        sku: product.sku,
        description: product.name,
        unitPrice: product.price ?? current.unitPrice,
      };
      return next;
    });
    setPickingIndex(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const headerPayload = {
        receiverName,
        unloadingPoint,
        deliveryCnpj,
        orderDate: orderDate || undefined,
        requestedDeliveryDate: requestedDeliveryDate || undefined,
        notes,
        obsExpedicao: obsExpedicao,
        status,
        priority: Number(priority),
        mercadoEletronicoStatus,
        contaAzulStatus,
        invoiceNumber,
        totalValue,
        carrierId: carrierId.trim() || null,
      };

      if (isSiteOrder && siteItemsEditable) {
        const siteItems: Array<{
          productId: string;
          quantity: number;
          unitPrice: number;
        }> = [];

        for (const it of items) {
          if (!it.productId) {
            throw new Error(
              `Selecione o produto do estoque na linha ${it.lineNumber}.`,
            );
          }
          const qty = Number(it.quantity);
          if (!Number.isInteger(qty) || qty < 1) {
            throw new Error(`Quantidade inválida na linha ${it.lineNumber}.`);
          }
          const unitPrice = Number(String(it.unitPrice).replace(',', '.'));
          if (!Number.isFinite(unitPrice) || unitPrice < 0) {
            throw new Error(`Preço inválido na linha ${it.lineNumber}.`);
          }
          siteItems.push({
            productId: it.productId,
            quantity: qty,
            unitPrice,
          });
        }

        const productIds = siteItems.map((i) => i.productId);
        if (new Set(productIds).size !== productIds.length) {
          throw new Error('Não repita o mesmo produto em mais de um item.');
        }

        await erpFetchJson(pedidoApiUrl(numeroPed, 'admin'), {
          method: 'PATCH',
          body: JSON.stringify(headerPayload),
        });
        await erpFetchJson(pedidoApiUrl(numeroPed, 'site-items'), {
          method: 'PATCH',
          body: JSON.stringify({ items: siteItems }),
        });
      } else {
        await erpFetchJson(pedidoApiUrl(numeroPed, 'admin'), {
          method: 'PATCH',
          body: JSON.stringify({
            ...headerPayload,
            items: items.map((it) => ({
              id: it.id,
              lineNumber: it.lineNumber,
              sku: it.sku,
              description: it.description,
              quantity: Number(it.quantity),
              mercadoEletronicoItemStatus: it.mercadoEletronicoItemStatus || null,
            })),
          }),
        });
      }

      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar pedido.');
    } finally {
      setSaving(false);
    }
  };

  const carrierOptions = [
    { value: '', label: '— Nenhuma —' },
    ...carriers.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[var(--color-overlay)]"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Editar pedido #{order.externalOrderNumber ?? order.code}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Admin — alterações registradas nos logs de auditoria.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--input-bg)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="erp-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="mb-3 rounded-lg border border-rose-500/40 bg-rose-100 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          ) : null}

          {isSimpleCustomerLayout ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Número do pedido</span>
                  <input className={readOnlyFieldClass()} readOnly value={orderNumberDisplay} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Data entrega</span>
                  <input
                    type="date"
                    className={fieldClass()}
                    value={requestedDeliveryDate}
                    onChange={(e) => setRequestedDeliveryDate(e.target.value)}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Cliente</span>
                  <input className={readOnlyFieldClass()} readOnly value={order.customerName} />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Endereço</span>
                  <input className={readOnlyFieldClass()} readOnly value={deliveryAddressDisplay} />
                </label>
              </div>

              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Observação</span>
                <textarea className={`${fieldClass()} min-h-[72px]`} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Recebedor</span>
                  <input className={fieldClass()} value={receiverName} onChange={(e) => setReceiverName(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Ponto de descarga</span>
                  <input className={fieldClass()} value={unloadingPoint} onChange={(e) => setUnloadingPoint(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">CNPJ comprador</span>
                  <input className={fieldClass()} value={deliveryCnpj} onChange={(e) => setDeliveryCnpj(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Data pedido</span>
                  <input type="date" className={fieldClass()} value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Data entrega</span>
                  <input type="date" className={fieldClass()} value={requestedDeliveryDate} onChange={(e) => setRequestedDeliveryDate(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Valor total</span>
                  <input className={fieldClass()} value={totalValue} onChange={(e) => setTotalValue(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Status</span>
                  <select className={fieldClass()} value={status} onChange={(e) => setStatus(e.target.value)}>
                    {ORDER_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Prioridade</span>
                  <input type="number" min={1} max={5} className={fieldClass()} value={priority} onChange={(e) => setPriority(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Transportadora</span>
                  <PremiumSelect value={carrierId} onChange={setCarrierId} options={carrierOptions} placeholder="Selecionar…" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Status ME</span>
                  <input className={fieldClass()} value={mercadoEletronicoStatus} onChange={(e) => setMercadoEletronicoStatus(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Status CA</span>
                  <input className={fieldClass()} value={contaAzulStatus} onChange={(e) => setContaAzulStatus(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Nota de venda</span>
                  <input className={fieldClass()} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
                </label>
              </div>

              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Observações WEG</span>
                <textarea className={`${fieldClass()} min-h-[72px]`} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Obs. expedição</span>
                <textarea className={`${fieldClass()} min-h-[72px]`} value={obsExpedicao} onChange={(e) => setObsExpedicao(e.target.value)} />
              </label>
            </>
          )}

          <h3 className="mt-5 mb-2 text-sm font-semibold text-[var(--text-primary)]">Itens</h3>
          <div className="overflow-x-auto rounded-xl border border-[var(--border-color)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--input-bg)] text-xs text-[var(--text-secondary)]">
                <tr>
                  <th className="px-2 py-2 text-left">Linha</th>
                  {isSiteOrder ? (
                    <th className="px-2 py-2 text-left" colSpan={2}>
                      Produto (estoque)
                    </th>
                  ) : (
                    <>
                      <th className="px-2 py-2 text-left">SKU</th>
                      <th className="px-2 py-2 text-left">Item</th>
                    </>
                  )}
                  <th className="px-2 py-2 text-left">Qtd</th>
                  {!isSimpleCustomerLayout ? (
                    <th className="px-2 py-2 text-left">Status item</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={it.id} className="border-t border-[var(--border-color)]">
                    <td className="px-2 py-2">{it.lineNumber}</td>
                    {isSiteOrder ? (
                      <td className="px-2 py-2" colSpan={2}>
                        <button
                          type="button"
                          disabled={busy || !siteItemsEditable}
                          onClick={() => openPickerFor(idx)}
                          className={`${fieldClass()} flex items-start gap-2 text-left disabled:cursor-default disabled:opacity-80`}
                        >
                          <Search className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                          <span className="min-w-0 flex-1">
                            {it.productId || it.sku ? (
                              <>
                                <span className="block truncate font-medium text-[var(--text-primary)]">
                                  {it.description || 'Produto'}
                                </span>
                                <span className="block truncate font-mono text-[10px] text-[var(--text-muted)]">
                                  {it.sku}
                                </span>
                              </>
                            ) : (
                              <span className="text-[var(--text-muted)]">
                                Buscar produto no estoque…
                              </span>
                            )}
                          </span>
                        </button>
                      </td>
                    ) : (
                      <>
                        <td className="px-2 py-2">
                          <input
                            className={fieldClass()}
                            value={it.sku}
                            onChange={(e) => {
                              const next = [...items];
                              next[idx] = { ...it, sku: e.target.value };
                              setItems(next);
                            }}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className={fieldClass()}
                            value={it.description}
                            onChange={(e) => {
                              const next = [...items];
                              next[idx] = { ...it, description: e.target.value };
                              setItems(next);
                            }}
                          />
                        </td>
                      </>
                    )}
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={1}
                        className={`${fieldClass()} w-20`}
                        value={it.quantity}
                        disabled={busy || (isSiteOrder && !siteItemsEditable)}
                        onChange={(e) => {
                          const next = [...items];
                          next[idx] = { ...it, quantity: e.target.value };
                          setItems(next);
                        }}
                      />
                    </td>
                    {!isSimpleCustomerLayout ? (
                      <td className="px-2 py-2">
                        <select
                          className={fieldClass()}
                          value={it.mercadoEletronicoItemStatus}
                          onChange={(e) => {
                            const next = [...items];
                            next[idx] = {
                              ...it,
                              mercadoEletronicoItemStatus: e.target.value,
                            };
                            setItems(next);
                          }}
                        >
                          {ITEM_STATUS_OPTIONS.map((opt) => (
                            <option key={opt || 'empty'} value={opt}>
                              {opt || '—'}
                            </option>
                          ))}
                        </select>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border-color)] px-5 py-4">
          <button type="button" className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            onClick={() => void handleSave()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salvar alterações
          </button>
        </div>
      </div>

      <InventoryProductPickerModal
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          setPickingIndex(null);
        }}
        onSelect={handleInventorySelect}
      />
    </div>
  );
}
