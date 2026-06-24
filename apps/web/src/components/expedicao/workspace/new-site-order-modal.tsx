'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { generateUUID } from '@/src/lib/uuid';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

const SITE_CARRIER_NAMES = ['JADLOG', 'SEDEX', 'PAC', 'MINI ENVIOS'] as const;

type CadastroOption = {
  id: string;
  name: string;
  isActive: boolean;
  cnpj?: string | null;
};

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
  customerId?: string;
  carrierId?: string;
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

function lineNumberForIndex(index: number) {
  return (index + 1) * 10;
}

function buildFieldErrors(
  externalOrderNumber: string,
  requestedDeliveryDate: string,
  customerId: string,
  carrierId: string,
  items: OrderItemForm[],
): FormFieldErrors {
  const errors: FormFieldErrors = {};

  if (!externalOrderNumber.trim()) {
    errors.externalOrderNumber = 'Informe o número do pedido no site';
  }
  if (!requestedDeliveryDate.trim()) {
    errors.requestedDeliveryDate = 'Selecione a data de entrega';
  }
  if (!customerId) {
    errors.customerId = 'Selecione ou crie um cliente';
  }
  if (!carrierId) {
    errors.carrierId = 'Selecione a transportadora';
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
    errors.customerId ||
    errors.carrierId ||
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
      `}</style>
    </div>
  );
}

function InlineCreateButton(props: {
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onToggle}
      className="ml-2 inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-0.5 text-xs font-medium text-[var(--accent)] transition hover:bg-[var(--input-bg)]"
    >
      <Plus className="h-3 w-3" />
      {props.label}
    </button>
  );
}

export function NewSiteOrderModal(props: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { isOpen, onClose, onCreated } = props;

  const [loadingOptions, setLoadingOptions] = useState(false);
  const [customers, setCustomers] = useState<CadastroOption[]>([]);
  const [defaultReceiverId, setDefaultReceiverId] = useState('');
  const [defaultUnloadingPointId, setDefaultUnloadingPointId] = useState('');
  const [carriers, setCarriers] = useState<CadastroOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  const [externalOrderNumber, setExternalOrderNumber] = useState('');
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [carrierId, setCarrierId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OrderItemForm[]>([newItemRow()]);

  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    setCustomerId('');
    setCarrierId('');
    setNotes('');
    setItems([newItemRow()]);
    setShowCreateCustomer(false);
    setNewCustomerName('');
    setNewCustomerEmail('');
    setNewCustomerPhone('');
    setFieldErrors({});
    setSubmitError(null);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    resetForm();
    setLoadingOptions(true);
    void Promise.all([
      loadActiveCadastro('cadastros/customers'),
      loadActiveCadastro('cadastros/receivers'),
      loadActiveCadastro('cadastros/unloading-points'),
      loadActiveCadastro('cadastros/carriers'),
      loadActiveProducts(),
    ])
      .then(([cust, recv, unload, carr, prods]) => {
        setCustomers(cust);
        setDefaultReceiverId(recv[0]?.id ?? '');
        setDefaultUnloadingPointId(unload[0]?.id ?? '');
        setCarriers(
          carr.filter((c) =>
            SITE_CARRIER_NAMES.includes(
              c.name.trim().toUpperCase() as (typeof SITE_CARRIER_NAMES)[number],
            ),
          ),
        );
        setProducts(prods);
      })
      .catch(() => {
        setSubmitError('Falha ao carregar opções do formulário.');
      })
      .finally(() => setLoadingOptions(false));
  }, [isOpen, resetForm]);

  const handleCreateCustomer = async () => {
    const name = newCustomerName.trim();
    if (!name) {
      setSubmitError('Informe o nome do cliente.');
      return;
    }
    setCreatingCustomer(true);
    setSubmitError(null);
    try {
      const created = await erpFetchJson<CadastroOption>('cadastros/customers', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email: newCustomerEmail.trim() || undefined,
          phone: newCustomerPhone.trim() || undefined,
        }),
      });
      setCustomers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setCustomerId(created.id);
      setShowCreateCustomer(false);
      setNewCustomerName('');
      setNewCustomerEmail('');
      setNewCustomerPhone('');
      clearFieldError('customerId');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Falha ao criar cliente.');
    } finally {
      setCreatingCustomer(false);
    }
  };

  const handleSubmit = async () => {
    const errors = buildFieldErrors(
      externalOrderNumber,
      requestedDeliveryDate,
      customerId,
      carrierId,
      items,
    );

    if (hasFieldErrors(errors)) {
      setFieldErrors(errors);
      setSubmitError(null);
      return;
    }

    if (!defaultReceiverId || !defaultUnloadingPointId) {
      setSubmitError(
        'Cadastre ao menos um recebedor e um ponto de descarga antes de criar pedidos do site.',
      );
      return;
    }

    const productIds = items.map((i) => i.productId);
    if (new Set(productIds).size !== productIds.length) {
      setSubmitError('Não repita o mesmo produto em mais de um item.');
      return;
    }

    const selectedCustomer = customers.find((c) => c.id === customerId);
    const deliveryCnpj = selectedCustomer?.cnpj?.trim() || undefined;

    setSaving(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      await erpFetchJson('api/pedidos/site', {
        method: 'POST',
        body: JSON.stringify({
          externalOrderNumber: externalOrderNumber.trim(),
          requestedDeliveryDate: requestedDeliveryDate.trim(),
          customerId,
          deliveryCnpj,
          carrierId,
          receiverId: defaultReceiverId,
          unloadingPointId: defaultUnloadingPointId,
          notes: notes.trim() || undefined,
          items: items.map((row) => ({
            productId: row.productId,
            quantity: Number(row.quantity),
          })),
        }),
      });
      onCreated();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Falha ao criar pedido do site.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[var(--color-overlay)]"
        aria-label="Fechar"
        onClick={onClose}
        disabled={saving}
      />

      <div
        className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl"
        role="dialog"
        aria-labelledby="site-order-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            id="site-order-title"
            className="text-lg font-semibold text-[var(--text-primary)]"
          >
            Pedido do Site
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
          {loadingOptions ? (
            <div className="flex items-center gap-2 py-6 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando opções…
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block">
                <span className={labelClass()}>
                  Número do pedido no site <span className="text-rose-400">*</span>
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
                  placeholder="Ex.: SITE-12345"
                  disabled={saving}
                />
              </label>
              <FieldError message={fieldErrors.externalOrderNumber} />
            </div>

            <div>
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

            <div className="sm:col-span-2">
              <span className={labelClass()}>
                Nome do cliente <span className="text-rose-400">*</span>
                <InlineCreateButton
                  label="Criar cliente"
                  onToggle={() => setShowCreateCustomer((v) => !v)}
                />
              </span>
              <select
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  clearFieldError('customerId');
                  setSubmitError(null);
                }}
                className={fieldClass(Boolean(fieldErrors.customerId))}
                disabled={saving || loadingOptions}
              >
                <option value="">Selecione…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.customerId} />
              {showCreateCustomer ? (
                <div className="mt-2 space-y-2 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)]/40 p-3">
                  <input
                    type="text"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="Nome *"
                    className={fieldClass()}
                    disabled={creatingCustomer}
                  />
                  <input
                    type="email"
                    value={newCustomerEmail}
                    onChange={(e) => setNewCustomerEmail(e.target.value)}
                    placeholder="E-mail"
                    className={fieldClass()}
                    disabled={creatingCustomer}
                  />
                  <input
                    type="tel"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    placeholder="Telefone"
                    className={fieldClass()}
                    disabled={creatingCustomer}
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateCustomer()}
                    disabled={creatingCustomer}
                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {creatingCustomer ? 'Salvando…' : 'Salvar cliente'}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="sm:col-span-2">
              <label className="block">
                <span className={labelClass()}>
                  Transportadora <span className="text-rose-400">*</span>
                </span>
                <select
                  value={carrierId}
                  onChange={(e) => {
                    setCarrierId(e.target.value);
                    clearFieldError('carrierId');
                    setSubmitError(null);
                  }}
                  className={fieldClass(Boolean(fieldErrors.carrierId))}
                  disabled={saving || loadingOptions}
                >
                  <option value="">Selecione…</option>
                  {carriers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <FieldError message={fieldErrors.carrierId} />
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

                return (
                  <div key={row.key}>
                    <div className="grid grid-cols-1 items-start gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)]/40 p-3 sm:grid-cols-[52px_108px_minmax(0,1fr)_88px_36px]">
                      <div>
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
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          value={selectedProduct?.sku ?? ''}
                          placeholder="—"
                          className={`${fieldClass()} cursor-default font-mono text-sm opacity-80`}
                        />
                      </div>
                      <div className="min-w-0">
                        <select
                          value={row.productId}
                          onChange={(e) => {
                            const value = e.target.value;
                            setItems((prev) =>
                              prev.map((it) =>
                                it.key === row.key ? { ...it, productId: value } : it,
                              ),
                            );
                            clearItemRowError(row.key, 'productId');
                            setSubmitError(null);
                          }}
                          className={fieldClass(Boolean(rowErrors?.productId))}
                          disabled={saving || loadingOptions}
                        >
                          <option value="">Selecione o produto</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <FieldError message={rowErrors?.productId} />
                      </div>
                      <div>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={row.quantity}
                          onChange={(e) => {
                            setItems((prev) =>
                              prev.map((it) =>
                                it.key === row.key
                                  ? { ...it, quantity: e.target.value }
                                  : it,
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
        </div>

        <div className="flex shrink-0 gap-3 border-t border-[var(--border-color)] bg-[var(--input-bg)]/30 px-5 py-4">
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
            {saving ? 'Salvando…' : 'Criar Pedido Site'}
          </button>
        </div>
      </div>
    </div>
  );
}
