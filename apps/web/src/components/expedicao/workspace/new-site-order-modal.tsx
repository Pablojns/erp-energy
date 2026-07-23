'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { generateUUID } from '@/src/lib/uuid';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import {
  sortProductsForSearch,
} from '@/src/lib/product-search';
import { normalizePedidoFromApi } from '@/src/services/api/pedidos-normalize';

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

function normalizeExternalOrderNumber(value: string) {
  return value.replace(/^#/, '');
}

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

function formatCepInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function cepDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 8);
}

function buildDeliveryAddress(parts: {
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
}): string {
  const line1 = [parts.street.trim(), parts.number.trim()].filter(Boolean).join(', ');
  const segments = [
    line1,
    parts.complement.trim() || null,
    parts.neighborhood.trim() || null,
    parts.city.trim() && parts.state.trim()
      ? `${parts.city.trim()}/${parts.state.trim()}`
      : parts.city.trim() || parts.state.trim() || null,
    parts.cep.trim() ? `CEP ${formatCepInput(parts.cep)}` : null,
  ].filter(Boolean);
  return segments.join(' - ');
}

type ViaCepResponse = {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

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
  onCreated: (order?: OrderDto) => void;
}) {
  const { isOpen, onClose, onCreated } = props;

  const [loadingOptions, setLoadingOptions] = useState(false);
  const [customers, setCustomers] = useState<CadastroOption[]>([]);
  const [carriers, setCarriers] = useState<CadastroOption[]>([]);
  const [companies, setCompanies] = useState<
    Array<{ id: string; name: string; cnpj: string; isMatriz: boolean }>
  >([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  const [externalOrderNumber, setExternalOrderNumber] = useState('');
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [carrierId, setCarrierId] = useState('');
  const [companyEntityId, setCompanyEntityId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OrderItemForm[]>([newItemRow()]);
  const [productSearch, setProductSearch] = useState<Record<string, string>>({});
  const [openProductDropdown, setOpenProductDropdown] = useState<string | null>(null);

  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerCep, setNewCustomerCep] = useState('');
  const [newCustomerStreet, setNewCustomerStreet] = useState('');
  const [newCustomerNumber, setNewCustomerNumber] = useState('');
  const [newCustomerComplement, setNewCustomerComplement] = useState('');
  const [newCustomerNeighborhood, setNewCustomerNeighborhood] = useState('');
  const [newCustomerCity, setNewCustomerCity] = useState('');
  const [newCustomerState, setNewCustomerState] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [loadingCep, setLoadingCep] = useState(false);
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
    setCompanyEntityId('');
    setNotes('');
    setItems([newItemRow()]);
    setProductSearch({});
    setOpenProductDropdown(null);
    setShowCreateCustomer(false);
    setNewCustomerName('');
    setNewCustomerCep('');
    setNewCustomerStreet('');
    setNewCustomerNumber('');
    setNewCustomerComplement('');
    setNewCustomerNeighborhood('');
    setNewCustomerCity('');
    setNewCustomerState('');
    setNewCustomerEmail('');
    setNewCustomerPhone('');
    setLoadingCep(false);
    setFieldErrors({});
    setSubmitError(null);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    resetForm();
    setLoadingOptions(true);
    void Promise.all([
      loadActiveCadastro('cadastros/customers'),
      loadActiveCadastro('cadastros/carriers'),
      erpFetchJson<
        Array<{ id: string; name: string; cnpj: string; isMatriz: boolean; isActive: boolean }>
      >('cadastros/company-entities'),
      loadActiveProducts(),
    ])
      .then(([cust, carr, comps, prods]) => {
        setCustomers(cust);
        setCarriers(
          carr.filter((c) =>
            SITE_CARRIER_NAMES.includes(
              c.name.trim().toUpperCase() as (typeof SITE_CARRIER_NAMES)[number],
            ),
          ),
        );
        const activeCompanies = comps.filter((c) => c.isActive);
        setCompanies(activeCompanies);
        // Site → Londrina (filial)
        const londrina = activeCompanies.find((c) =>
          c.name.toLowerCase().includes('londrina'),
        );
        setCompanyEntityId(
          londrina?.id ??
            activeCompanies.find((c) => !c.isMatriz)?.id ??
            activeCompanies[0]?.id ??
            '',
        );
        setProducts(prods);
      })
      .catch(() => {
        setSubmitError('Falha ao carregar opções do formulário.');
      })
      .finally(() => setLoadingOptions(false));
  }, [isOpen, resetForm]);

  const handleCepBlur = async () => {
    const digits = cepDigits(newCustomerCep);
    if (digits.length !== 8) return;

    setLoadingCep(true);
    setSubmitError(null);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      if (!res.ok) return;
      const data = (await res.json()) as ViaCepResponse;
      if (data.erro) return;
      if (data.logradouro) setNewCustomerStreet(data.logradouro);
      if (data.bairro) setNewCustomerNeighborhood(data.bairro);
      if (data.localidade) setNewCustomerCity(data.localidade);
      if (data.uf) setNewCustomerState(data.uf);
    } catch {
      /* preenchimento manual se ViaCEP falhar */
    } finally {
      setLoadingCep(false);
    }
  };

  const handleCreateCustomer = async () => {
    const name = newCustomerName.trim();
    if (!name) {
      setSubmitError('Informe o nome do cliente.');
      return;
    }
    if (cepDigits(newCustomerCep).length !== 8) {
      setSubmitError('Informe um CEP válido.');
      return;
    }
    if (!newCustomerStreet.trim() || !newCustomerNumber.trim()) {
      setSubmitError('Informe rua e número do endereço.');
      return;
    }
    if (!newCustomerNeighborhood.trim() || !newCustomerCity.trim() || !newCustomerState.trim()) {
      setSubmitError('Informe bairro, cidade e estado.');
      return;
    }

    const deliveryAddress = buildDeliveryAddress({
      street: newCustomerStreet,
      number: newCustomerNumber,
      complement: newCustomerComplement,
      neighborhood: newCustomerNeighborhood,
      city: newCustomerCity,
      state: newCustomerState,
      cep: newCustomerCep,
    });

    setCreatingCustomer(true);
    setSubmitError(null);
    try {
      const created = await erpFetchJson<CadastroOption>('cadastros/customers', {
        method: 'POST',
        body: JSON.stringify({
          name,
          deliveryAddress,
          email: newCustomerEmail.trim() || undefined,
          phone: newCustomerPhone.trim() || undefined,
        }),
      });
      setCustomers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setCustomerId(created.id);
      setShowCreateCustomer(false);
      setNewCustomerName('');
      setNewCustomerCep('');
      setNewCustomerStreet('');
      setNewCustomerNumber('');
      setNewCustomerComplement('');
      setNewCustomerNeighborhood('');
      setNewCustomerCity('');
      setNewCustomerState('');
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
      const created = await erpFetchJson<Record<string, unknown>>('api/pedidos/site', {
        method: 'POST',
        body: JSON.stringify({
          externalOrderNumber: normalizeExternalOrderNumber(externalOrderNumber.trim()),
          requestedDeliveryDate: requestedDeliveryDate.trim(),
          customerId,
          deliveryCnpj,
          carrierId,
          companyEntityId: companyEntityId || undefined,
          notes: notes.trim() || undefined,
          items: items.map((row) => ({
            productId: row.productId,
            quantity: Number(row.quantity),
          })),
        }),
      });
      onCreated(normalizePedidoFromApi(created));
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
                    setExternalOrderNumber(normalizeExternalOrderNumber(e.target.value));
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
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={newCustomerCep}
                      onChange={(e) => setNewCustomerCep(formatCepInput(e.target.value))}
                      onBlur={() => void handleCepBlur()}
                      placeholder="CEP *"
                      className={fieldClass()}
                      disabled={creatingCustomer || loadingCep}
                    />
                    <input
                      type="text"
                      value={newCustomerStreet}
                      onChange={(e) => setNewCustomerStreet(e.target.value)}
                      placeholder="Rua *"
                      className={fieldClass()}
                      disabled={creatingCustomer || loadingCep}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      type="text"
                      value={newCustomerNumber}
                      onChange={(e) => setNewCustomerNumber(e.target.value)}
                      placeholder="Número *"
                      className={fieldClass()}
                      disabled={creatingCustomer}
                    />
                    <input
                      type="text"
                      value={newCustomerComplement}
                      onChange={(e) => setNewCustomerComplement(e.target.value)}
                      placeholder="Complemento"
                      className={fieldClass()}
                      disabled={creatingCustomer}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <input
                      type="text"
                      value={newCustomerNeighborhood}
                      onChange={(e) => setNewCustomerNeighborhood(e.target.value)}
                      placeholder="Bairro *"
                      className={fieldClass()}
                      disabled={creatingCustomer || loadingCep}
                    />
                    <input
                      type="text"
                      value={newCustomerCity}
                      onChange={(e) => setNewCustomerCity(e.target.value)}
                      placeholder="Cidade *"
                      className={fieldClass()}
                      disabled={creatingCustomer || loadingCep}
                    />
                    <input
                      type="text"
                      value={newCustomerState}
                      onChange={(e) => setNewCustomerState(e.target.value.toUpperCase().slice(0, 2))}
                      placeholder="Estado *"
                      className={fieldClass()}
                      disabled={creatingCustomer || loadingCep}
                    />
                  </div>
                  {loadingCep ? (
                    <p className="text-xs text-[var(--text-secondary)]">Buscando CEP…</p>
                  ) : null}
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
                    disabled={creatingCustomer || loadingCep}
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

            <div className="sm:col-span-2">
              <label className="block">
                <span className={labelClass()}>CNPJ emissor da nota</span>
                <select
                  value={companyEntityId}
                  onChange={(e) => setCompanyEntityId(e.target.value)}
                  className={fieldClass()}
                  disabled={saving || loadingOptions}
                >
                  <option value="">Padrão (Londrina)</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.isMatriz ? ' · Matriz' : ''}
                    </option>
                  ))}
                </select>
              </label>
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
                  const row = newItemRow();
                  setItems((prev) => [...prev, row]);
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
                const filteredProducts = sortProductsForSearch(products, searchQuery);
                const showDropdown = openProductDropdown === row.key;

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
                      <div className="relative min-w-0">
                        <input
                          type="search"
                          value={searchQuery}
                          onChange={(e) => {
                            const value = e.target.value;
                            setProductSearch((prev) => ({
                              ...prev,
                              [row.key]: value,
                            }));
                            setItems((prev) =>
                              prev.map((it) =>
                                it.key === row.key ? { ...it, productId: '' } : it,
                              ),
                            );
                            setOpenProductDropdown(row.key);
                            clearItemRowError(row.key, 'productId');
                            setSubmitError(null);
                          }}
                          onFocus={() => setOpenProductDropdown(row.key)}
                          onBlur={() => {
                            window.setTimeout(() => {
                              setOpenProductDropdown((current) =>
                                current === row.key ? null : current,
                              );
                            }, 150);
                          }}
                          placeholder="Buscar produto (ex.: polo p)"
                          disabled={saving || loadingOptions}
                          className={fieldClass(Boolean(rowErrors?.productId))}
                          autoComplete="off"
                        />
                        {showDropdown && filteredProducts.length > 0 ? (
                          <ul
                            className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] py-1 shadow-lg"
                            role="listbox"
                          >
                            {filteredProducts.map((p) => (
                              <li key={p.id} role="option" aria-selected={p.id === row.productId}>
                                <button
                                  type="button"
                                  className="w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] transition hover:bg-[var(--input-bg)]"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setItems((prev) =>
                                      prev.map((it) =>
                                        it.key === row.key
                                          ? { ...it, productId: p.id }
                                          : it,
                                      ),
                                    );
                                    setProductSearch((prev) => ({
                                      ...prev,
                                      [row.key]: `${p.sku} — ${p.name}`,
                                    }));
                                    setOpenProductDropdown(null);
                                    clearItemRowError(row.key, 'productId');
                                    setSubmitError(null);
                                  }}
                                >
                                  <span className="font-mono text-xs text-[var(--text-muted)]">
                                    {p.sku}
                                  </span>
                                  <span className="mt-0.5 block text-sm">{p.name}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {showDropdown && searchQuery.trim() && filteredProducts.length === 0 ? (
                          <p className="absolute z-20 mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-xs text-[var(--text-muted)] shadow-lg">
                            Nenhum produto encontrado
                          </p>
                        ) : null}
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
                          onClick={() => {
                            setItems((prev) => {
                              if (prev.length <= 1) return prev;
                              return prev.filter((it) => it.key !== row.key);
                            });
                            setProductSearch((prev) => {
                              const next = { ...prev };
                              delete next[row.key];
                              return next;
                            });
                            if (openProductDropdown === row.key) {
                              setOpenProductDropdown(null);
                            }
                          }}
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
