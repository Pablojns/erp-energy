'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import { generateUUID } from '@/src/lib/uuid';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { sortProductsForSearch } from '@/src/lib/product-search';
import { normalizePedidoFromApi, pedidoApiUrl } from '@/src/services/api/pedidos-normalize';
import {
  WegBuyerCustomerSelector,
  wegBuyerCustomerLabel,
  type WegBuyerCustomer,
} from '@/src/components/expedicao/workspace/weg-buyer-customer-selector';

/** Mesmo shape de WegBuyerCustomer — evita drift de tipos no seletor de comprador. */
type CadastroOption = WegBuyerCustomer;

type ProductOption = {
  id: string;
  sku: string;
  name: string;
};

type OrderItemForm = {
  key: string;
  productId: string;
  quantity: string;
};

type PaginatedProducts = {
  data: ProductOption[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

type ItemRowErrors = {
  productId?: string;
  quantity?: string;
};

type FormFieldErrors = {
  externalOrderNumber?: string;
  requestedDeliveryDate?: string;
  receiverId?: string;
  customerId?: string;
  unloadingPointId?: string;
  items?: string;
  itemRows?: Record<string, ItemRowErrors>;
};

function fieldClass(invalid?: boolean) {
  return `w-full rounded-lg border px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)] ${
    invalid
      ? 'border-rose-500/70 bg-rose-500/[0.06]'
      : 'border-[var(--border-color)] bg-[var(--input-bg)]'
  }`;
}

function labelClass() {
  return 'mb-1.5 block text-sm font-medium text-[var(--text-secondary)]';
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-rose-500">{message}</p>;
}

async function loadActiveCadastro(path: string): Promise<CadastroOption[]> {
  const rows = await erpFetchJson<CadastroOption[]>(path);
  return (Array.isArray(rows) ? rows : []).filter((r) => r.isActive);
}

async function loadActiveProducts(): Promise<ProductOption[]> {
  const all: ProductOption[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await erpFetchJson<PaginatedProducts>(
      `products?page=${page}&pageSize=100&status=active&sortBy=sku&sortOrder=asc`,
    );
    all.push(...(res.data ?? []));
    totalPages = res.meta?.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages);
  return all;
}

function newItemRow(): OrderItemForm {
  return {
    key: generateUUID(),
    productId: '',
    quantity: '1',
  };
}

function formatCustomerLabel(c: CadastroOption) {
  return wegBuyerCustomerLabel(c);
}

function lineNumberForIndex(index: number) {
  return (index + 1) * 10;
}

type OrderFormSnapshot = {
  externalOrderNumber: string;
  requestedDeliveryDate: string;
  receiverId: string;
  customerId: string;
  unloadingPointId: string;
  notes: string;
  items: Array<{ productId: string; quantity: string }>;
};

type FieldChange = {
  label: string;
  from: string;
  to: string;
};

function snapshotFromForm(
  externalOrderNumber: string,
  requestedDeliveryDate: string,
  receiverId: string,
  customerId: string,
  unloadingPointId: string,
  notes: string,
  items: OrderItemForm[],
): OrderFormSnapshot {
  return {
    externalOrderNumber: externalOrderNumber.trim(),
    requestedDeliveryDate: requestedDeliveryDate.trim(),
    receiverId,
    customerId,
    unloadingPointId,
    notes: notes.trim(),
    items: items.map((row) => ({
      productId: row.productId,
      quantity: row.quantity.trim(),
    })),
  };
}

function formatDateBr(iso: string) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function optionLabel(id: string, list: CadastroOption[], formatter?: (o: CadastroOption) => string) {
  const row = list.find((o) => o.id === id);
  if (!row) return '—';
  return formatter ? formatter(row) : row.name;
}

function computeItemChanges(
  before: Array<{ productId: string; quantity: string }>,
  after: Array<{ productId: string; quantity: string }>,
  products: ProductOption[],
): FieldChange[] {
  const changes: FieldChange[] = [];
  const beforeMap = new Map(
    before.filter((r) => r.productId).map((r) => [r.productId, r.quantity]),
  );
  const afterMap = new Map(
    after.filter((r) => r.productId).map((r) => [r.productId, r.quantity]),
  );
  const allIds = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  for (const productId of allIds) {
    const bQty = beforeMap.get(productId);
    const aQty = afterMap.get(productId);
    const product = products.find((p) => p.id === productId);
    const sku = product?.sku ?? productId;

    if (bQty === undefined && aQty !== undefined) {
      changes.push({ label: sku, from: '—', to: `× ${aQty}` });
    } else if (bQty !== undefined && aQty === undefined) {
      changes.push({ label: sku, from: `× ${bQty}`, to: '—' });
    } else if (bQty !== undefined && aQty !== undefined && bQty !== aQty) {
      changes.push({ label: sku, from: `× ${bQty}`, to: `× ${aQty}` });
    }
  }

  return changes;
}

function computeOrderFormChanges(
  before: OrderFormSnapshot,
  after: OrderFormSnapshot,
  receivers: CadastroOption[],
  customers: CadastroOption[],
  unloadingPoints: CadastroOption[],
  products: ProductOption[],
): FieldChange[] {
  const changes: FieldChange[] = [];

  if (before.externalOrderNumber !== after.externalOrderNumber) {
    changes.push({
      label: 'número do pedido',
      from: before.externalOrderNumber || '—',
      to: after.externalOrderNumber || '—',
    });
  }
  if (before.requestedDeliveryDate !== after.requestedDeliveryDate) {
    changes.push({
      label: 'data de entrega',
      from: formatDateBr(before.requestedDeliveryDate),
      to: formatDateBr(after.requestedDeliveryDate),
    });
  }
  if (before.receiverId !== after.receiverId) {
    changes.push({
      label: 'recebedor',
      from: optionLabel(before.receiverId, receivers),
      to: optionLabel(after.receiverId, receivers),
    });
  }
  if (before.customerId !== after.customerId) {
    changes.push({
      label: 'CNPJ de entrega',
      from: optionLabel(before.customerId, customers, formatCustomerLabel),
      to: optionLabel(after.customerId, customers, formatCustomerLabel),
    });
  }
  if (before.unloadingPointId !== after.unloadingPointId) {
    changes.push({
      label: 'ponto de descarga',
      from: optionLabel(before.unloadingPointId, unloadingPoints),
      to: optionLabel(after.unloadingPointId, unloadingPoints),
    });
  }
  if (before.notes !== after.notes) {
    changes.push({
      label: 'observação',
      from: before.notes || '—',
      to: after.notes || '—',
    });
  }
  changes.push(...computeItemChanges(before.items, after.items, products));

  return changes;
}

function buildFieldErrors(
  externalOrderNumber: string,
  requestedDeliveryDate: string,
  receiverId: string,
  customerId: string,
  unloadingPointId: string,
  items: OrderItemForm[],
): FormFieldErrors {
  const errors: FormFieldErrors = {};

  if (!externalOrderNumber.trim()) {
    errors.externalOrderNumber = 'Informe o número do pedido';
  }
  if (!requestedDeliveryDate.trim()) {
    errors.requestedDeliveryDate = 'Selecione a data de entrega';
  }
  if (!receiverId) {
    errors.receiverId = 'Selecione um recebedor';
  }
  if (!customerId) {
    errors.customerId = 'Selecione o CNPJ de entrega';
  }
  if (!unloadingPointId) {
    errors.unloadingPointId = 'Selecione o ponto de descarga';
  }
  if (items.length === 0) {
    errors.items = 'Adicione pelo menos um item';
  } else {
    const itemRows: Record<string, ItemRowErrors> = {};
    for (const row of items) {
      const rowErr: ItemRowErrors = {};
      if (!row.productId) {
        rowErr.productId = 'Selecione o produto';
      }
      const qty = Number(row.quantity);
      if (!row.quantity.trim() || !Number.isInteger(qty) || qty < 1) {
        rowErr.quantity = 'Informe a quantidade';
      }
      if (Object.keys(rowErr).length > 0) {
        itemRows[row.key] = rowErr;
      }
    }
    if (Object.keys(itemRows).length > 0) {
      errors.itemRows = itemRows;
    }
  }

  return errors;
}

function hasFieldErrors(errors: FormFieldErrors) {
  if (
    errors.externalOrderNumber ||
    errors.requestedDeliveryDate ||
    errors.receiverId ||
    errors.customerId ||
    errors.unloadingPointId ||
    errors.items
  ) {
    return true;
  }
  return Boolean(errors.itemRows && Object.keys(errors.itemRows).length > 0);
}

function DatePickerField(props: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  error?: string;
}) {
  const { value, onChange, disabled, invalid, error } = props;
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    if (disabled) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
      } catch {
        el.click();
      }
    } else {
      el.click();
    }
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPicker();
          }
        }}
        className={`new-order-date-wrap relative cursor-pointer rounded-lg ${
          invalid ? 'ring-1 ring-rose-500/60' : ''
        }`}
      >
        <input
          ref={inputRef}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`new-order-date-input ${fieldClass(invalid)} min-h-[42px] cursor-pointer text-base`}
          onClick={(e) => {
            e.stopPropagation();
            openPicker();
          }}
        />
      </div>
      <FieldError message={error} />
      <style jsx>{`
        .new-order-date-wrap :global(.new-order-date-input) {
          position: relative;
          width: 100%;
          min-height: 2.625rem;
          font-size: 1rem;
          -webkit-appearance: none;
          appearance: none;
        }
        .new-order-date-wrap :global(.new-order-date-input::-webkit-calendar-picker-indicator) {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;
          opacity: 0;
          cursor: pointer;
        }
        .new-order-date-wrap :global(.new-order-date-input::-webkit-date-and-time-value) {
          text-align: left;
          min-height: 1.5rem;
        }
      `}</style>
    </div>
  );
}

export function NewOrderModal(props: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (order?: OrderDto) => void;
  editOrder?: OrderDto | null;
}) {
  const { isOpen, onClose, onCreated, editOrder = null } = props;
  const isEdit = Boolean(editOrder);

  const [loadingOptions, setLoadingOptions] = useState(false);
  const [receivers, setReceivers] = useState<CadastroOption[]>([]);
  const [customers, setCustomers] = useState<CadastroOption[]>([]);
  const [unloadingPoints, setUnloadingPoints] = useState<CadastroOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  const [externalOrderNumber, setExternalOrderNumber] = useState('');
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState('');
  const [receiverId, setReceiverId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [buyerQuery, setBuyerQuery] = useState('');
  const [unloadingPointId, setUnloadingPointId] = useState('');
  const [notes, setNotes] = useState('');
  const [isUrgentManual, setIsUrgentManual] = useState(false);
  const [items, setItems] = useState<OrderItemForm[]>([newItemRow()]);
  const [productSearch, setProductSearch] = useState<Record<string, string>>({});

  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [initialSnapshot, setInitialSnapshot] = useState<OrderFormSnapshot | null>(null);
  const [pendingChanges, setPendingChanges] = useState<FieldChange[]>([]);

  const productById = useCallback(
    (id: string) => products.find((p) => p.id === id),
    [products],
  );

  const clearFieldError = useCallback((key: keyof FormFieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const clearItemRowError = useCallback(
    (rowKey: string, field: keyof ItemRowErrors) => {
      setFieldErrors((prev) => {
        const row = prev.itemRows?.[rowKey];
        if (!row?.[field]) return prev;
        const nextRows = { ...prev.itemRows };
        const nextRow = { ...row };
        delete nextRow[field];
        if (Object.keys(nextRow).length === 0) {
          delete nextRows[rowKey];
        } else {
          nextRows[rowKey] = nextRow;
        }
        const next = { ...prev };
        if (Object.keys(nextRows).length === 0) {
          delete next.itemRows;
        } else {
          next.itemRows = nextRows;
        }
        return next;
      });
    },
    [],
  );

  const resetForm = useCallback(() => {
    setExternalOrderNumber('');
    setRequestedDeliveryDate('');
    setReceiverId('');
    setCustomerId('');
    setBuyerQuery('');
    setUnloadingPointId('');
    setNotes('');
    setIsUrgentManual(false);
    setItems([newItemRow()]);
    setProductSearch({});
    setFieldErrors({});
    setSubmitError(null);
    setSaving(false);
    setStep('form');
    setInitialSnapshot(null);
    setPendingChanges([]);
  }, []);

  const populateFromOrder = useCallback(
    (
      order: OrderDto,
      r: CadastroOption[],
      c: CadastroOption[],
      u: CadastroOption[],
    ) => {
      const receiverMatch =
        r.find((row) => row.name.trim() === (order.receiverName ?? '').trim())?.id ?? '';
      const customerMatchRow = c.find(
        (row) =>
          row.name.trim() === order.customerName.trim() ||
          (order.customerDocument &&
            row.cnpj?.trim() === order.customerDocument.trim()) ||
          (order.deliveryCnpj && row.cnpj?.trim() === order.deliveryCnpj.trim()),
      );
      const customerMatch = customerMatchRow?.id ?? '';
      const unloadingMatch =
        u.find((row) => row.name.trim() === (order.unloadingPoint ?? '').trim())?.id ?? '';
      const deliveryDate =
        order.requestedDeliveryDate?.slice(0, 10) ??
        order.orderDate?.slice(0, 10) ??
        '';

      setExternalOrderNumber(order.externalOrderNumber ?? '');
      setRequestedDeliveryDate(deliveryDate);
      setReceiverId(receiverMatch);
      setCustomerId(customerMatch);
      setBuyerQuery(
        customerMatchRow
          ? formatCustomerLabel(customerMatchRow)
          : order.deliveryCnpj ?? order.customerDocument ?? order.customerName ?? '',
      );
      setUnloadingPointId(unloadingMatch);
      setNotes(order.notes ?? '');
      const nextItems =
        order.items.length > 0
          ? order.items.map((item) => ({
              key: generateUUID(),
              productId: item.productId ?? '',
              quantity: String(item.quantity),
            }))
          : [newItemRow()];
      setItems(nextItems);

      setInitialSnapshot(
        snapshotFromForm(
          order.externalOrderNumber ?? '',
          deliveryDate,
          receiverMatch,
          customerMatch,
          unloadingMatch,
          order.notes ?? '',
          nextItems,
        ),
      );
    },
    [],
  );

  useEffect(() => {
    if (!isOpen) return;
    resetForm();
    setLoadingOptions(true);
    void Promise.all([
      loadActiveCadastro('cadastros/receivers'),
      loadActiveCadastro('cadastros/customers'),
      loadActiveCadastro('cadastros/unloading-points'),
      loadActiveProducts(),
    ])
      .then(([r, c, u, p]) => {
        setReceivers(r);
        setCustomers(c);
        setUnloadingPoints(u);
        setProducts(p);
        if (editOrder) {
          populateFromOrder(editOrder, r, c, u);
        }
      })
      .catch((err: unknown) => {
        setSubmitError(
          err instanceof Error
            ? err.message
            : 'Falha ao carregar opções do formulário.',
        );
      })
      .finally(() => setLoadingOptions(false));
  }, [isOpen, resetForm, editOrder, populateFromOrder]);

  const persistOrder = async () => {
    const payload = {
      externalOrderNumber: externalOrderNumber.trim(),
      requestedDeliveryDate: requestedDeliveryDate.trim(),
      receiverId,
      customerId,
      unloadingPointId,
      notes: notes.trim() || undefined,
      ...(isEdit ? {} : { isUrgentManual }),
      items: items.map((row) => ({
        productId: row.productId,
        quantity: Number(row.quantity),
      })),
    };

    if (isEdit && editOrder) {
      const numeroPed = editOrder.externalOrderNumber?.trim();
      if (!numeroPed) {
        throw new Error('Número do pedido não encontrado.');
      }
      const updated = await erpFetchJson<Record<string, unknown>>(pedidoApiUrl(numeroPed), {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      onCreated(normalizePedidoFromApi(updated));
    } else {
      const created = await erpFetchJson<Record<string, unknown>>('api/pedidos', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onCreated(normalizePedidoFromApi(created));
    }
    onClose();
  };

  const handleSubmit = async () => {
    const errors = buildFieldErrors(
      externalOrderNumber,
      requestedDeliveryDate,
      receiverId,
      customerId,
      unloadingPointId,
      items,
    );

    if (hasFieldErrors(errors)) {
      setFieldErrors(errors);
      setSubmitError(null);
      return;
    }

    const productIds = items.map((i) => i.productId);
    if (new Set(productIds).size !== productIds.length) {
      setSubmitError('Não repita o mesmo produto em mais de um item.');
      return;
    }

    if (isEdit && initialSnapshot && step === 'form') {
      const current = snapshotFromForm(
        externalOrderNumber,
        requestedDeliveryDate,
        receiverId,
        customerId,
        unloadingPointId,
        notes,
        items,
      );
      const changes = computeOrderFormChanges(
        initialSnapshot,
        current,
        receivers,
        customers,
        unloadingPoints,
        products,
      );
      if (changes.length === 0) {
        setSubmitError('Nenhuma alteração foi feita.');
        return;
      }
      setPendingChanges(changes);
      setStep('confirm');
      setSubmitError(null);
      return;
    }

    setSaving(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      await persistOrder();
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : isEdit
            ? 'Falha ao atualizar pedido.'
            : 'Falha ao criar pedido.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="erp-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[var(--color-overlay)]"
        aria-label="Fechar"
        onClick={onClose}
        disabled={saving}
      />

      <div
        className="erp-modal-panel relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl"
        role="dialog"
        aria-labelledby="new-order-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            id="new-order-title"
            className="text-lg font-semibold text-[var(--text-primary)]"
          >
            {isEdit ? 'Editar Pedido Manual' : 'Novo Pedido Manual'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md p-1 text-[var(--text-secondary)] transition hover:bg-[var(--input-bg)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {step === 'confirm' ? (
            <div className="space-y-4">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Revise as alterações antes de confirmar:
              </p>
              <ul className="space-y-3">
                {pendingChanges.map((change) => (
                  <li
                    key={`${change.label}-${change.from}-${change.to}`}
                    className="rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)]/40 px-3 py-2 text-sm text-[var(--text-secondary)]"
                  >
                    Você está mudando <strong>{change.label}</strong> de{' '}
                    <span className="text-[var(--text-primary)]">{change.from}</span> para{' '}
                    <span className="text-[var(--text-primary)]">{change.to}</span>. Tem certeza?
                  </li>
                ))}
              </ul>
              {submitError ? <p className="text-sm text-rose-400">{submitError}</p> : null}
            </div>
          ) : (
            <>
          {loadingOptions ? (
            <div className="flex items-center gap-2 py-6 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando opções…
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-1">
              <label className="block">
                <span className={labelClass()}>
                  Número do pedido <span className="text-rose-400">*</span>
                </span>
                <input
                  type="text"
                  value={externalOrderNumber}
                  onChange={(e) => {
                    setExternalOrderNumber(e.target.value);
                    clearFieldError('externalOrderNumber');
                    setSubmitError(null);
                  }}
                  className={fieldClass(Boolean(fieldErrors.externalOrderNumber))}
                  placeholder="Ex.: F-12345"
                  disabled={saving}
                />
              </label>
              <FieldError message={fieldErrors.externalOrderNumber} />
            </div>

            <div className="sm:col-span-1">
              <span className={labelClass()}>
                Data de entrega prevista <span className="text-rose-400">*</span>
              </span>
              <DatePickerField
                value={requestedDeliveryDate}
                onChange={(value) => {
                  setRequestedDeliveryDate(value);
                  clearFieldError('requestedDeliveryDate');
                  setSubmitError(null);
                }}
                disabled={saving}
                invalid={Boolean(fieldErrors.requestedDeliveryDate)}
                error={fieldErrors.requestedDeliveryDate}
              />
            </div>

            <div className="sm:col-span-1">
              <label className="block">
                <span className={labelClass()}>
                  Recebedor <span className="text-rose-400">*</span>
                </span>
                <select
                  value={receiverId}
                  onChange={(e) => {
                    setReceiverId(e.target.value);
                    clearFieldError('receiverId');
                    setSubmitError(null);
                  }}
                  className={fieldClass(Boolean(fieldErrors.receiverId))}
                  disabled={saving || loadingOptions}
                >
                  <option value="">Selecione…</option>
                  {receivers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <FieldError message={fieldErrors.receiverId} />
            </div>

            <div className="sm:col-span-1">
              <label className="block">
                <span className={labelClass()}>
                  CNPJ de entrega <span className="text-rose-400">*</span>
                </span>
                <WegBuyerCustomerSelector
                  customers={customers}
                  value={buyerQuery}
                  onChange={(next) => {
                    setBuyerQuery(next);
                    if (customerId) setCustomerId('');
                    clearFieldError('customerId');
                    setSubmitError(null);
                  }}
                  onSelect={(customer) => {
                    setCustomerId(customer.id);
                    setBuyerQuery(formatCustomerLabel(customer));
                    clearFieldError('customerId');
                    setSubmitError(null);
                  }}
                  onCreated={(created) => {
                    setCustomers((prev) => {
                      if (prev.some((c) => c.id === created.id)) return prev;
                      const row: CadastroOption = {
                        id: created.id,
                        name: created.name,
                        cnpj: created.cnpj ?? null,
                        isActive: created.isActive ?? true,
                      };
                      return [...prev, row].sort((a, b) =>
                        a.name.localeCompare(b.name),
                      );
                    });
                  }}
                  disabled={saving || loadingOptions}
                  error={fieldErrors.customerId ?? null}
                  placeholder="Buscar por nome ou CNPJ…"
                  inputClassName={fieldClass(Boolean(fieldErrors.customerId)) + ' pr-8'}
                  listZIndexClassName="z-[60]"
                />
              </label>
            </div>

            <div className="sm:col-span-2">
              <label className="block">
                <span className={labelClass()}>
                  Ponto de descarga <span className="text-rose-400">*</span>
                </span>
                <select
                  value={unloadingPointId}
                  onChange={(e) => {
                    setUnloadingPointId(e.target.value);
                    clearFieldError('unloadingPointId');
                    setSubmitError(null);
                  }}
                  className={fieldClass(Boolean(fieldErrors.unloadingPointId))}
                  disabled={saving || loadingOptions}
                >
                  <option value="">Selecione…</option>
                  {unloadingPoints.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <FieldError message={fieldErrors.unloadingPointId} />
            </div>

            <label className="block sm:col-span-2">
              <span className={labelClass()}>Observação</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className={fieldClass()}
                placeholder="Observações opcionais"
                disabled={saving}
              />
            </label>

            {!isEdit ? (
              <label className="flex items-start gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={isUrgentManual}
                  onChange={(e) => setIsUrgentManual(e.target.checked)}
                  disabled={saving}
                  className="mt-1 h-4 w-4 rounded border-[var(--border-color)]"
                />
                <span className="text-sm text-[var(--text-secondary)]">
                  Pedido Urgente (sem requisição do ME ainda)
                </span>
              </label>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Itens do pedido <span className="text-rose-400">*</span>
              </p>
              <button
                type="button"
                onClick={() => {
                  setItems((prev) => [...prev, newItemRow()]);
                  clearFieldError('items');
                  setSubmitError(null);
                }}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--input-bg)]"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar item
              </button>
            </div>

            <FieldError message={fieldErrors.items} />

            <div className="hidden gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] sm:grid sm:grid-cols-[52px_108px_minmax(0,1fr)_88px_36px]">
              <span>Linha</span>
              <span>SKU</span>
              <span>Produto</span>
              <span>Qtd.</span>
              <span className="sr-only">Remover</span>
            </div>

            <div className="space-y-2">
              {items.map((row, index) => {
                const rowErrors = fieldErrors.itemRows?.[row.key];
                const selectedProduct = productById(row.productId);
                const lineNo = lineNumberForIndex(index);
                const searchQuery = productSearch[row.key] ?? '';
                const filteredProducts = (() => {
                  const ranked = sortProductsForSearch(products, searchQuery);
                  if (!row.productId) return ranked;
                  const selected = products.find((p) => p.id === row.productId);
                  if (!selected) return ranked;
                  if (ranked.some((p) => p.id === selected.id)) return ranked;
                  return [selected, ...ranked];
                })();

                return (
                  <div key={row.key}>
                    <div className="grid grid-cols-1 items-start gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)]/40 p-3 sm:grid-cols-[52px_108px_minmax(0,1fr)_88px_36px]">
                      <div>
                        <span className="mb-1 block text-xs text-[var(--text-muted)] sm:sr-only">
                          Linha
                        </span>
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          value={lineNo}
                          className={`${fieldClass()} cursor-default text-center font-semibold opacity-80`}
                          aria-label={`Linha ${lineNo}`}
                        />
                      </div>

                      <div>
                        <span className="mb-1 block text-xs text-[var(--text-muted)] sm:sr-only">
                          SKU
                        </span>
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          value={selectedProduct?.sku ?? ''}
                          placeholder="—"
                          className={`${fieldClass()} cursor-default font-mono text-sm opacity-80`}
                          aria-label="SKU do produto"
                        />
                      </div>

                      <div className="min-w-0">
                        <span className="mb-1 block text-xs text-[var(--text-muted)] sm:sr-only">
                          Produto
                        </span>
                        <input
                          type="search"
                          value={searchQuery}
                          onChange={(e) => {
                            setProductSearch((prev) => ({
                              ...prev,
                              [row.key]: e.target.value,
                            }));
                          }}
                          placeholder="Buscar produto (ex.: polo p)"
                          disabled={saving || loadingOptions}
                          className={`${fieldClass()} mb-1.5`}
                        />
                        <select
                          value={row.productId}
                          onChange={(e) => {
                            const value = e.target.value;
                            setItems((prev) =>
                              prev.map((it) =>
                                it.key === row.key
                                  ? { ...it, productId: value }
                                  : it,
                              ),
                            );
                            clearItemRowError(row.key, 'productId');
                            setSubmitError(null);
                          }}
                          className={fieldClass(Boolean(rowErrors?.productId))}
                          disabled={saving || loadingOptions}
                        >
                          <option value="">
                            {filteredProducts.length === 0
                              ? 'Nenhum produto encontrado'
                              : 'Selecione o produto'}
                          </option>
                          {filteredProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.sku} — {p.name}
                            </option>
                          ))}
                        </select>
                        <FieldError message={rowErrors?.productId} />
                      </div>

                      <div>
                        <span className="mb-1 block text-xs text-[var(--text-muted)] sm:sr-only">
                          Quantidade
                        </span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={row.quantity}
                          onChange={(e) => {
                            const value = e.target.value;
                            setItems((prev) =>
                              prev.map((it) =>
                                it.key === row.key ? { ...it, quantity: value } : it,
                              ),
                            );
                            clearItemRowError(row.key, 'quantity');
                            setSubmitError(null);
                          }}
                          className={fieldClass(Boolean(rowErrors?.quantity))}
                          disabled={saving}
                        />
                        <FieldError message={rowErrors?.quantity} />
                      </div>

                      <div className="flex items-start justify-end sm:justify-center">
                        <button
                          type="button"
                          onClick={() =>
                            setItems((prev) =>
                              prev.length <= 1
                                ? prev
                                : prev.filter((it) => it.key !== row.key),
                            )
                          }
                          disabled={saving || items.length <= 1}
                          className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-rose-500/30 text-lg leading-none text-rose-400 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Remover item"
                          aria-label="Remover item"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {submitError ? <p className="text-sm text-rose-400">{submitError}</p> : null}
            </>
          )}
        </div>

        <div className="flex shrink-0 gap-3 border-t border-[var(--border-color)] bg-[var(--input-bg)]/30 px-5 py-4">
          {step === 'confirm' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setStep('form');
                  setPendingChanges([]);
                  setSubmitError(null);
                }}
                disabled={saving}
                className="flex-1 rounded-lg border border-[var(--border-color)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--input-bg)]"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={saving}
                className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-inverse)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Salvando…' : 'Confirmar'}
              </button>
            </>
          ) : (
            <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg border border-[var(--border-color)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--input-bg)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving || loadingOptions}
            className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-inverse)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar pedido'}
          </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
