'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { formatDeliveryAddressDisplay } from '@/src/components/cadastros/delivery-address';
import {
  canEditSiteOrderItems,
  resolveItemReceiptStatusForOrder,
} from '@/src/components/expedicao/shared/order-helpers';
import { useOrderItemsStock } from '@/src/components/expedicao/shared/use-order-items-stock';
import type { OrderDto, OrderItemDto } from '@/src/components/expedicao/shared/types';
import {
  OrderItemOrderedQtyCell,
  OrderItemStockQtyCell,
} from '@/src/components/expedicao/workspace/order-item-stock-cells';
import { OrderItemReceiptStatusBadge } from '@/src/components/expedicao/workspace/order-item-receipt-status-badge';
import {
  InventoryProductPickerModal,
  type InventoryProductOption,
} from '@/src/components/expedicao/workspace/inventory-product-picker-modal';
import {
  WegBuyerCustomerSelector,
  wegBuyerCustomerLabel,
  type WegBuyerCustomer,
} from '@/src/components/expedicao/workspace/weg-buyer-customer-selector';
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
  pickedQty: number;
  mercadoEletronicoItemStatus: string;
  isNew?: boolean;
};

function fieldClass() {
  return 'w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]';
}

function readOnlyFieldClass() {
  return `${fieldClass()} cursor-default bg-[var(--bg-card)] text-[var(--text-secondary)] focus:ring-0`;
}

function calcItemsTotal(rows: EditItemRow[]): string {
  const sum = rows.reduce((acc, it) => {
    const qty = Number(it.quantity) || 0;
    const price = Number(String(it.unitPrice).replace(',', '.')) || 0;
    return acc + qty * price;
  }, 0);
  return sum.toFixed(2);
}

let newItemSeq = 0;
function nextTempItemId() {
  newItemSeq += 1;
  return `new-${Date.now()}-${newItemSeq}`;
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
  const [companies, setCompanies] = useState<
    Array<{ id: string; name: string; cnpj: string; isMatriz: boolean }>
  >([]);

  const [receiverName, setReceiverName] = useState('');
  const [unloadingPoint, setUnloadingPoint] = useState('');
  const [deliveryCnpj, setDeliveryCnpj] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [buyerQuery, setBuyerQuery] = useState('');
  const [customers, setCustomers] = useState<WegBuyerCustomer[]>([]);
  const [orderDate, setOrderDate] = useState('');
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [obsExpedicao, setObsExpedicao] = useState('');
  const [status, setStatus] = useState('NOVO');
  const [priority, setPriority] = useState('3');
  const [mercadoEletronicoStatus, setMercadoEletronicoStatus] = useState('');
  const [contaAzulStatus, setContaAzulStatus] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceHistory, setInvoiceHistory] = useState<
    Array<{
      key: string;
      id?: string;
      invoiceNumber: string;
      invoiceValue: string;
      createdAt: string;
    }>
  >([]);
  const [totalValue, setTotalValue] = useState('');
  const [carrierId, setCarrierId] = useState('');
  const [companyEntityId, setCompanyEntityId] = useState('');
  const [items, setItems] = useState<EditItemRow[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickingIndex, setPickingIndex] = useState<number | null>(null);
  const [pickingMode, setPickingMode] = useState<'replace' | 'add'>('replace');

  const stockLookupItems = useMemo((): OrderItemDto[] => {
    if (!isOpen || !order || order.source !== 'SITE') return [];
    return items.map((it) => {
      const original = order.items.find((o) => o.id === it.id);
      return {
        ...(original ?? {
          id: it.id,
          lineNumber: it.lineNumber,
          reservedQuantity: 0,
          unit: null,
          ncm: null,
          totalPrice: '0',
          stockAvailable: null,
          openNeed: 0,
          stockCoversOpenNeed: false,
          product: null,
        }),
        id: it.id,
        lineNumber: it.lineNumber,
        sku: it.sku,
        description: it.description,
        quantity: Number(it.quantity) || 0,
        unitPrice: it.unitPrice,
        productId: it.productId || null,
        pickedQty: it.pickedQty,
        mercadoEletronicoItemStatus: it.mercadoEletronicoItemStatus || null,
      } as OrderItemDto;
    });
  }, [isOpen, order, items]);

  const stockByItemId = useOrderItemsStock(stockLookupItems);

  useEffect(() => {
    if (!isOpen) return;
    void erpFetchJson<CarrierOption[]>('cadastros/carriers')
      .then((rows) => setCarriers(rows.filter((c) => c.isActive)))
      .catch(() => setCarriers([]));
    void erpFetchJson<
      Array<{
        id: string;
        name: string;
        cnpj: string;
        isMatriz: boolean;
        isActive: boolean;
      }>
    >('cadastros/company-entities')
      .then((rows) => setCompanies(rows.filter((c) => c.isActive)))
      .catch(() => setCompanies([]));
    void erpFetchJson<WegBuyerCustomer[]>('cadastros/customers')
      .then((rows) =>
        setCustomers(
          rows
            .filter((c) => c.isActive)
            .map((c) => ({
              id: c.id,
              name: c.name,
              cnpj: c.cnpj ?? null,
              deliveryAddress: c.deliveryAddress ?? null,
              isActive: c.isActive ?? true,
            })),
        ),
      )
      .catch(() => setCustomers([]));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !order) return;
    setReceiverName(order.receiverName ?? '');
    setUnloadingPoint(order.unloadingPoint ?? '');
    const initialCnpj = order.deliveryCnpj ?? order.customerDocument ?? '';
    setDeliveryCnpj(initialCnpj);
    setDeliveryAddress(order.deliveryAddress ?? '');
    setCustomerId(order.customerId ?? null);
    setBuyerQuery(
      order.customerName?.trim()
        ? `${order.customerName.trim()}${initialCnpj ? ` — ${initialCnpj}` : ''}`
        : initialCnpj,
    );
    setOrderDate(order.orderDate?.slice(0, 10) ?? '');
    setRequestedDeliveryDate(order.requestedDeliveryDate?.slice(0, 10) ?? '');
    setNotes(order.notes ?? '');
    setObsExpedicao(order.obsExpedicao ?? '');
    setStatus(order.status);
    setPriority(String(order.priority));
    setMercadoEletronicoStatus(order.mercadoEletronicoStatus ?? '');
    setContaAzulStatus(order.contaAzulStatus ?? '');
    setInvoiceNumber(order.invoiceNumber ?? '');
    setInvoiceHistory(
      order.invoiceNumber?.trim()
        ? [
            {
              key: `seed-${order.id}`,
              invoiceNumber: order.invoiceNumber.trim(),
              invoiceValue: order.totalValue ?? '',
              createdAt: (order.updatedAt ?? new Date().toISOString()).slice(
                0,
                10,
              ),
            },
          ]
        : [],
    );
    setTotalValue(order.totalValue ?? '');
    setCarrierId(order.carrierId ?? '');
    setCompanyEntityId(order.companyEntityId ?? '');
    setItems(
      order.items.map((it) => ({
        id: it.id,
        lineNumber: it.lineNumber,
        productId: it.productId ?? '',
        sku: it.sku,
        description: it.description,
        quantity: String(it.quantity),
        unitPrice: it.unitPrice ?? '0',
        pickedQty: it.pickedQty ?? 0,
        mercadoEletronicoItemStatus: it.mercadoEletronicoItemStatus ?? '',
      })),
    );
    setError(null);
    setPickerOpen(false);
    setPickingIndex(null);
    setPickingMode('replace');

    const numero = numeroPedFromOrder(order);
    if (numero) {
      void erpFetchJson<{
        historico: Array<{
          id: string;
          invoiceNumber: string;
          invoiceValue?: string | null;
          createdAt: string;
        }>;
      }>(pedidoApiUrl(numero, 'nf-historico'))
        .then((res) => {
          const rows = Array.isArray(res.historico) ? res.historico : [];
          if (rows.length === 0) return;
          setInvoiceHistory(
            rows.map((row) => ({
              key: row.id,
              id: row.id,
              invoiceNumber: row.invoiceNumber,
              invoiceValue: row.invoiceValue ?? '',
              createdAt: row.createdAt.slice(0, 10),
            })),
          );
          const latest = [...rows].sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          )[0];
          if (latest) setInvoiceNumber(latest.invoiceNumber);
        })
        .catch(() => {
          /* mantém seed do invoiceNumber do pedido */
        });
    }
  }, [isOpen, order]);

  useEffect(() => {
    if (!isOpen || !order || customers.length === 0) return;
    const initialCnpj = (order.deliveryCnpj ?? order.customerDocument ?? '').trim();
    const matched = customers.find(
      (c) =>
        c.id === (order.customerId ?? '') ||
        (initialCnpj.length > 0 &&
          (c.cnpj ?? '').replace(/\D/g, '') === initialCnpj.replace(/\D/g, '')),
    );
    if (!matched) return;
    setCustomerId((prev) => prev ?? matched.id);
    setBuyerQuery((prev) => (prev.trim() ? prev : wegBuyerCustomerLabel(matched)));
    if (matched.deliveryAddress?.trim() && !order.deliveryAddress?.trim()) {
      setDeliveryAddress(matched.deliveryAddress);
    }
  }, [isOpen, order, customers]);

  if (!isOpen || !order) return null;

  const numeroPed = numeroPedFromOrder(order);
  if (!numeroPed) return null;

  const isSiteOrder = order.source === 'SITE';
  const isWegOrder = order.source === 'WEG_MERCADO_ELETRONICO';
  const siteItemsEditable = canEditSiteOrderItems(order, 'orders');
  const canAddWegItem = isWegOrder;
  const isSimpleCustomerLayout =
    isSiteOrder || order.source === 'VENDA_EXTERNA';
  const orderNumberDisplay = order.externalOrderNumber ?? order.code;
  const deliveryAddressDisplay = formatDeliveryAddressDisplay(
    deliveryAddress || unloadingPoint,
  );
  const busy = saving;

  const applyBuyerCustomer = (customer: WegBuyerCustomer) => {
    const cnpj = customer.cnpj?.trim() || '';
    setCustomerId(customer.id);
    setDeliveryCnpj(cnpj);
    setBuyerQuery(wegBuyerCustomerLabel(customer));
    if (customer.deliveryAddress?.trim()) {
      setDeliveryAddress(customer.deliveryAddress);
    }
    setError(null);
  };

  const openPickerFor = (idx: number) => {
    if (!siteItemsEditable) return;
    setPickingMode('replace');
    setPickingIndex(idx);
    setPickerOpen(true);
    setError(null);
  };

  const openAddItemPicker = () => {
    if (!canAddWegItem) return;
    setPickingMode('add');
    setPickingIndex(null);
    setPickerOpen(true);
    setError(null);
  };

  const handleInventorySelect = (product: InventoryProductOption) => {
    if (pickingMode === 'add') {
      setItems((prev) => {
        const nextLine =
          prev.reduce((max, it) => Math.max(max, it.lineNumber), 0) + 10;
        const next = [
          ...prev,
          {
            id: nextTempItemId(),
            lineNumber: nextLine,
            productId: product.id,
            sku: product.sku,
            description: product.name,
            quantity: '1',
            unitPrice: product.price ?? '0',
            pickedQty: 0,
            mercadoEletronicoItemStatus: '',
            isNew: true,
          },
        ];
        setTotalValue(calcItemsTotal(next));
        return next;
      });
      setPickingMode('replace');
      return;
    }

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
      if (isWegOrder) setTotalValue(calcItemsTotal(next));
      return next;
    });
    setPickingIndex(null);
  };

  const updateItemField = (
    idx: number,
    patch: Partial<EditItemRow>,
  ) => {
    setItems((prev) => {
      const next = [...prev];
      const current = next[idx];
      if (!current) return prev;
      next[idx] = { ...current, ...patch };
      if (isWegOrder) setTotalValue(calcItemsTotal(next));
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const cleanedInvoices = invoiceHistory
        .map((row) => ({
          ...(row.id ? { id: row.id } : {}),
          invoiceNumber: row.invoiceNumber.trim(),
          invoiceValue: row.invoiceValue.trim() || null,
          createdAt: row.createdAt.trim() || undefined,
        }))
        .filter((row) => row.invoiceNumber.length > 0);

      const currentInvoice =
        [...cleanedInvoices].sort((a, b) =>
          String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')),
        )[0]?.invoiceNumber ?? '';

      const headerPayload = {
        receiverName,
        unloadingPoint,
        deliveryCnpj,
        deliveryAddress: deliveryAddress.trim() || null,
        customerId: customerId || null,
        orderDate: orderDate || undefined,
        requestedDeliveryDate: requestedDeliveryDate || undefined,
        notes,
        obsExpedicao: obsExpedicao,
        status,
        priority: Number(priority),
        mercadoEletronicoStatus,
        contaAzulStatus,
        invoiceNumber: isWegOrder ? currentInvoice : invoiceNumber,
        ...(isWegOrder ? { invoiceHistory: cleanedInvoices } : {}),
        totalValue,
        carrierId: carrierId.trim() || null,
        companyEntityId: companyEntityId.trim() || null,
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
        const lineNumbers = items.map((it) => it.lineNumber);
        if (lineNumbers.some((n) => !Number.isInteger(n) || n < 1)) {
          throw new Error('Número de linha inválido. Use inteiros ≥ 1.');
        }
        if (new Set(lineNumbers).size !== lineNumbers.length) {
          throw new Error('Números de linha duplicados. Cada linha deve ser única.');
        }
        await erpFetchJson(pedidoApiUrl(numeroPed, 'admin'), {
          method: 'PATCH',
          body: JSON.stringify({
            ...headerPayload,
            items: items.map((it) => {
              const qty = Number(it.quantity);
              const unitPrice = Number(String(it.unitPrice).replace(',', '.'));
              const base = {
                lineNumber: it.lineNumber,
                sku: it.sku,
                description: it.description,
                quantity: qty,
                mercadoEletronicoItemStatus: it.mercadoEletronicoItemStatus || null,
                ...(it.productId ? { productId: it.productId } : {}),
                ...(Number.isFinite(unitPrice) ? { unitPrice } : {}),
              };
              if (it.isNew || it.id.startsWith('new-')) {
                return base;
              }
              return { id: it.id, ...base };
            }),
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
      <div className="absolute inset-0 bg-[var(--color-overlay)]" aria-hidden />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl">
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

              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                  CNPJ emissor da nota
                </span>
                <select
                  className={fieldClass()}
                  value={companyEntityId}
                  onChange={(e) => setCompanyEntityId(e.target.value)}
                >
                  <option value="">— Não definido —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.isMatriz ? ' · Matriz' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block sm:col-span-2 lg:col-span-3">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                    Comprador
                  </span>
                  <WegBuyerCustomerSelector
                    customers={customers}
                    value={buyerQuery}
                    onChange={(next) => {
                      setBuyerQuery(next);
                      setCustomerId(null);
                    }}
                    onSelect={(customer) => {
                      applyBuyerCustomer(customer);
                    }}
                    onCreated={(created) => {
                      const row: WegBuyerCustomer = {
                        id: created.id,
                        name: created.name,
                        cnpj: created.cnpj ?? null,
                        deliveryAddress: created.deliveryAddress ?? null,
                        isActive: created.isActive ?? true,
                      };
                      setCustomers((prev) => {
                        if (prev.some((c) => c.id === row.id)) return prev;
                        return [...prev, row].sort((a, b) =>
                          a.name.localeCompare(b.name),
                        );
                      });
                      applyBuyerCustomer(row);
                    }}
                    disabled={busy}
                    placeholder="Buscar por nome ou CNPJ…"
                    listZIndexClassName="z-[60]"
                  />
                </label>
                <label className="block sm:col-span-2 lg:col-span-3">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                    Endereço (atualiza ao selecionar o cliente)
                  </span>
                  <input
                    className={readOnlyFieldClass()}
                    readOnly
                    value={deliveryAddressDisplay}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Recebedor</span>
                  <input className={fieldClass()} value={receiverName} onChange={(e) => setReceiverName(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Ponto de descarga</span>
                  <input className={fieldClass()} value={unloadingPoint} onChange={(e) => setUnloadingPoint(e.target.value)} />
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
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                    CNPJ emissor da nota
                  </span>
                  <select
                    className={fieldClass()}
                    value={companyEntityId}
                    onChange={(e) => setCompanyEntityId(e.target.value)}
                  >
                    <option value="">— Não definido —</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.isMatriz ? ' · Matriz' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Status ME</span>
                  <input className={fieldClass()} value={mercadoEletronicoStatus} onChange={(e) => setMercadoEletronicoStatus(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Status CA</span>
                  <input className={fieldClass()} value={contaAzulStatus} onChange={(e) => setContaAzulStatus(e.target.value)} />
                </label>
                <div className="block sm:col-span-2 lg:col-span-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">
                      Notas Fiscais
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-lg border border-[var(--border-color)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--input-bg)] disabled:opacity-60"
                      onClick={() => {
                        setInvoiceHistory((prev) => [
                          ...prev,
                          {
                            key: `new-${Date.now()}`,
                            invoiceNumber: '',
                            invoiceValue: '',
                            createdAt: new Date().toISOString().slice(0, 10),
                          },
                        ]);
                      }}
                    >
                      + Adicionar NF
                    </button>
                  </div>
                  {invoiceHistory.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-[var(--border-color)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                      Nenhuma NF cadastrada. Adicione uma ou mais notas — elas vão para o histórico do pedido.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {invoiceHistory.map((row, idx) => (
                        <div
                          key={row.key}
                          className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)]/40 p-2 sm:grid-cols-[1.2fr_1fr_auto_auto]"
                        >
                          <label className="block text-[11px] text-[var(--text-secondary)]">
                            Número
                            <input
                              className={`${fieldClass()} mt-0.5`}
                              value={row.invoiceNumber}
                              disabled={busy}
                              placeholder="Nº da NF"
                              onChange={(e) => {
                                const value = e.target.value;
                                setInvoiceHistory((prev) => {
                                  const next = [...prev];
                                  next[idx] = { ...row, invoiceNumber: value };
                                  return next;
                                });
                                setInvoiceNumber(value);
                              }}
                            />
                          </label>
                          <label className="block text-[11px] text-[var(--text-secondary)]">
                            Valor (R$)
                            <input
                              className={`${fieldClass()} mt-0.5`}
                              value={row.invoiceValue}
                              disabled={busy}
                              placeholder="0.00"
                              onChange={(e) => {
                                const value = e.target.value;
                                setInvoiceHistory((prev) => {
                                  const next = [...prev];
                                  next[idx] = { ...row, invoiceValue: value };
                                  return next;
                                });
                              }}
                            />
                          </label>
                          <label className="block text-[11px] text-[var(--text-secondary)]">
                            Data
                            <input
                              type="date"
                              className={`${fieldClass()} mt-0.5`}
                              value={row.createdAt}
                              disabled={busy}
                              onChange={(e) => {
                                const value = e.target.value;
                                setInvoiceHistory((prev) => {
                                  const next = [...prev];
                                  next[idx] = { ...row, createdAt: value };
                                  return next;
                                });
                              }}
                            />
                          </label>
                          <div className="flex items-end">
                            <button
                              type="button"
                              disabled={busy}
                              className="rounded-lg border border-rose-200 px-2.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                              onClick={() => {
                                setInvoiceHistory((prev) =>
                                  prev.filter((_, i) => i !== idx),
                                );
                              }}
                            >
                              Remover
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
          {isSiteOrder && siteItemsEditable ? (
            <p className="mb-2 text-xs text-[var(--text-secondary)]">
              Clique no produto para trocar o item do estoque. Quantidade editável abaixo.
            </p>
          ) : null}
          {canAddWegItem ? (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[var(--text-secondary)]">
                Adicione produtos do estoque interno. O total do pedido é recalculado automaticamente.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={openAddItemPicker}
                className="rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-card)] disabled:opacity-60"
              >
                + Adicionar Item
              </button>
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-xl border border-[var(--border-color)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--input-bg)] text-xs text-[var(--text-secondary)]">
                <tr>
                  <th className="px-2 py-2 text-left">Linha</th>
                  <th className="px-2 py-2 text-left">SKU</th>
                  <th className="px-2 py-2 text-left">Item</th>
                  <th className="px-2 py-2 text-center">Qtd</th>
                  {isWegOrder ? (
                    <th className="px-2 py-2 text-right">Preço un.</th>
                  ) : null}
                  {isSiteOrder ? (
                    <>
                      <th className="px-2 py-2 text-center whitespace-nowrap">Qtd Separada</th>
                      <th className="px-2 py-2 text-center">Falta</th>
                      <th className="px-2 py-2 text-center">Qtd Estoque</th>
                      <th className="px-2 py-2 text-center">Status item</th>
                    </>
                  ) : !isSimpleCustomerLayout ? (
                    <th className="px-2 py-2 text-left">Status item</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const qtyNum = Number(it.quantity) || 0;
                  const picked = it.pickedQty ?? 0;
                  const missing = Math.max(0, qtyNum - picked);
                  const stock = stockByItemId[it.id] ?? {
                    available: null,
                    loading: true,
                  };
                  const orderItemForStatus = order.items.find((o) => o.id === it.id);

                  if (isSiteOrder) {
                    return (
                      <tr key={it.id} className="border-t border-[var(--border-color)]">
                        <td className="px-2 py-2 text-xs">{it.lineNumber}</td>
                        <td className="px-2 py-2 font-mono text-xs">{it.sku || '—'}</td>
                        <td className="px-2 py-2">
                          {siteItemsEditable ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => openPickerFor(idx)}
                              className={`${fieldClass()} flex max-w-md items-start gap-2 text-left`}
                              title="Trocar produto"
                            >
                              <Search className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                              <span className="min-w-0 flex-1 truncate font-medium text-[var(--text-primary)]">
                                {it.description || 'Buscar produto no estoque…'}
                              </span>
                            </button>
                          ) : (
                            <span className="text-xs" title={it.description}>
                              {it.description || '—'}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {siteItemsEditable ? (
                            <input
                              type="number"
                              min={1}
                              className={`${fieldClass()} mx-auto w-20 text-center`}
                              value={it.quantity}
                              disabled={busy}
                              onChange={(e) => {
                                updateItemField(idx, { quantity: e.target.value });
                              }}
                            />
                          ) : (
                            <OrderItemOrderedQtyCell qty={qtyNum} />
                          )}
                        </td>
                        <td className="px-2 py-2 text-center text-xs font-semibold">{picked}</td>
                        <td
                          className={`px-2 py-2 text-center text-xs font-semibold ${
                            missing > 0 ? 'text-amber-600' : 'text-emerald-600'
                          }`}
                        >
                          {missing}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <OrderItemStockQtyCell orderedQty={qtyNum} stock={stock} />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <OrderItemReceiptStatusBadge
                            status={
                              orderItemForStatus
                                ? resolveItemReceiptStatusForOrder(
                                    orderItemForStatus,
                                    order.status,
                                  )
                                : it.mercadoEletronicoItemStatus || null
                            }
                          />
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={it.id}
                      className={`border-t border-[var(--border-color)] ${
                        it.isNew ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={1}
                          step={10}
                          className={`${fieldClass()} w-20`}
                          value={it.lineNumber}
                          disabled={busy}
                          onChange={(e) => {
                            const n = Number.parseInt(e.target.value, 10);
                            if (!Number.isFinite(n)) return;
                            updateItemField(idx, { lineNumber: n });
                          }}
                        />
                      </td>
                      <td className="px-2 py-2">
                        {it.isNew ? (
                          <span className="font-mono text-xs">{it.sku || '—'}</span>
                        ) : (
                          <input
                            className={fieldClass()}
                            value={it.sku}
                            onChange={(e) =>
                              updateItemField(idx, { sku: e.target.value })
                            }
                          />
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {it.isNew ? (
                          <span className="text-xs font-medium" title={it.description}>
                            {it.description || '—'}
                          </span>
                        ) : (
                          <input
                            className={fieldClass()}
                            value={it.description}
                            onChange={(e) =>
                              updateItemField(idx, { description: e.target.value })
                            }
                          />
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={1}
                          className={`${fieldClass()} w-20`}
                          value={it.quantity}
                          disabled={busy}
                          onChange={(e) =>
                            updateItemField(idx, { quantity: e.target.value })
                          }
                        />
                      </td>
                      {isWegOrder ? (
                        <td className="px-2 py-2 text-right font-mono text-xs">
                          {Number(String(it.unitPrice).replace(',', '.')).toLocaleString(
                            'pt-BR',
                            { style: 'currency', currency: 'BRL' },
                          )}
                        </td>
                      ) : null}
                      {!isSimpleCustomerLayout ? (
                        <td className="px-2 py-2">
                          <select
                            className={fieldClass()}
                            value={it.mercadoEletronicoItemStatus}
                            onChange={(e) =>
                              updateItemField(idx, {
                                mercadoEletronicoItemStatus: e.target.value,
                              })
                            }
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
                  );
                })}
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
          setPickingMode('replace');
        }}
        onSelect={handleInventorySelect}
      />
    </div>
  );
}
