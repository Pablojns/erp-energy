'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { generateUUID } from '@/src/lib/uuid';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { normalizePedidoFromApi } from '@/src/services/api/pedidos-normalize';

type CadastroOption = {
  id: string;
  name: string;
  isActive: boolean;
};

type OrderItemForm = {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

type ItemRowErrors = {
  description?: string;
  quantity?: string;
  unitPrice?: string;
};

type FormFieldErrors = {
  externalOrderNumber?: string;
  requestedDeliveryDate?: string;
  customerId?: string;
  items?: string;
  itemRows?: Record<string, ItemRowErrors>;
};

type ViaCepResponse = {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
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

function newItemRow(): OrderItemForm {
  return {
    key: generateUUID(),
    description: '',
    quantity: '1',
    unitPrice: '',
  };
}

function buildFieldErrors(
  externalOrderNumber: string,
  requestedDeliveryDate: string,
  customerId: string,
  items: OrderItemForm[],
): FormFieldErrors {
  const errors: FormFieldErrors = {};

  if (!externalOrderNumber.trim()) {
    errors.externalOrderNumber = 'Informe o número do pedido';
  }
  if (!requestedDeliveryDate.trim()) {
    errors.requestedDeliveryDate = 'Selecione a data de entrega';
  }
  if (!customerId) {
    errors.customerId = 'Selecione ou crie um cliente';
  }
  if (items.length === 0) {
    errors.items = 'Adicione pelo menos um item';
  } else {
    const itemRows: Record<string, ItemRowErrors> = {};
    for (const row of items) {
      const rowErr: ItemRowErrors = {};
      if (!row.description.trim()) {
        rowErr.description = 'Informe a descrição';
      }
      const qty = Number(row.quantity);
      if (!row.quantity.trim() || !Number.isInteger(qty) || qty < 1) {
        rowErr.quantity = 'Informe a quantidade';
      }
      const price = Number(row.unitPrice);
      if (!row.unitPrice.trim() || Number.isNaN(price) || price < 0) {
        rowErr.unitPrice = 'Informe o preço unitário';
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
  if (errors.externalOrderNumber || errors.requestedDeliveryDate || errors.customerId || errors.items) {
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
    </div>
  );
}

function InlineCreateButton(props: { label: string; onToggle: () => void }) {
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

export function NewVendaExternaModal(props: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (order: OrderDto) => void | Promise<void>;
}) {
  const { isOpen, onClose, onCreated } = props;

  const [externalOrderNumber, setExternalOrderNumber] = useState('');
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [carrierId, setCarrierId] = useState('');
  const [notaRemessa, setNotaRemessa] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OrderItemForm[]>([newItemRow()]);

  const [customers, setCustomers] = useState<CadastroOption[]>([]);
  const [carriers, setCarriers] = useState<CadastroOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({});

  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
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
    setNotaRemessa('');
    setNotes('');
    setItems([newItemRow()]);
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
    ])
      .then(([cust, carr]) => {
        setCustomers(cust);
        setCarriers(carr);
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
      /* preenchimento manual */
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
      items,
    );

    if (hasFieldErrors(errors)) {
      setFieldErrors(errors);
      setSubmitError(null);
      return;
    }

    setSaving(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      const created = await erpFetchJson<Record<string, unknown>>('api/pedidos/venda-externa', {
        method: 'POST',
        body: JSON.stringify({
          externalOrderNumber: externalOrderNumber.trim(),
          requestedDeliveryDate: requestedDeliveryDate.trim(),
          customerId,
          carrierId: carrierId.trim() || undefined,
          notaRemessa: notaRemessa.trim() || undefined,
          notes: notes.trim() || undefined,
          items: items.map((row) => ({
            description: row.description.trim(),
            quantity: Number(row.quantity),
            unitPrice: Number(row.unitPrice),
          })),
        }),
      });
      await onCreated(normalizePedidoFromApi(created));
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Falha ao criar venda externa.');
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
        aria-labelledby="venda-externa-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            id="venda-externa-title"
            className="text-lg font-semibold text-[var(--text-primary)]"
          >
            Nova Venda Externa
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
                  placeholder="Ex.: VE-12345"
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
                Cliente <span className="text-rose-400">*</span>
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
                disabled={saving}
                className={fieldClass(Boolean(fieldErrors.customerId))}
              >
                <option value="">— Selecionar —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.customerId} />
            </div>

            {showCreateCustomer ? (
              <div className="sm:col-span-2 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)]/40 p-4">
                <p className="mb-3 text-sm font-medium text-[var(--text-primary)]">Novo cliente</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="Nome *"
                    className={fieldClass()}
                    disabled={creatingCustomer}
                  />
                  <input
                    type="text"
                    value={formatCepInput(newCustomerCep)}
                    onChange={(e) => setNewCustomerCep(e.target.value)}
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
                    disabled={creatingCustomer}
                  />
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
                  <input
                    type="text"
                    value={newCustomerNeighborhood}
                    onChange={(e) => setNewCustomerNeighborhood(e.target.value)}
                    placeholder="Bairro *"
                    className={fieldClass()}
                    disabled={creatingCustomer}
                  />
                  <input
                    type="text"
                    value={newCustomerCity}
                    onChange={(e) => setNewCustomerCity(e.target.value)}
                    placeholder="Cidade *"
                    className={fieldClass()}
                    disabled={creatingCustomer}
                  />
                  <input
                    type="text"
                    value={newCustomerState}
                    onChange={(e) => setNewCustomerState(e.target.value)}
                    placeholder="UF *"
                    maxLength={2}
                    className={fieldClass()}
                    disabled={creatingCustomer}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleCreateCustomer()}
                  disabled={creatingCustomer}
                  className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {creatingCustomer ? 'Salvando…' : 'Salvar cliente'}
                </button>
              </div>
            ) : null}

            <div>
              <span className={labelClass()}>Transportadora</span>
              <select
                value={carrierId}
                onChange={(e) => setCarrierId(e.target.value)}
                disabled={saving}
                className={fieldClass()}
              >
                <option value="">— Opcional —</option>
                {carriers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block">
                <span className={labelClass()}>Nota de remessa</span>
                <input
                  type="text"
                  value={notaRemessa}
                  onChange={(e) => setNotaRemessa(e.target.value)}
                  className={fieldClass()}
                  placeholder="Opcional"
                  disabled={saving}
                />
              </label>
            </div>

            <div className="sm:col-span-2">
              <label className="block">
                <span className={labelClass()}>Observações</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className={fieldClass()}
                  placeholder="Opcional"
                  disabled={saving}
                />
              </label>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--text-primary)]">
                Itens <span className="text-rose-400">*</span>
              </span>
              <button
                type="button"
                onClick={() => setItems((prev) => [...prev, newItemRow()])}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs font-medium text-[var(--accent)]"
              >
                <Plus className="h-3 w-3" />
                Adicionar item
              </button>
            </div>
            <FieldError message={fieldErrors.items} />

            <div className="space-y-2">
              {items.map((row, index) => {
                const rowErr = fieldErrors.itemRows?.[row.key];
                return (
                  <div
                    key={row.key}
                    className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--border-color)] p-3 sm:grid-cols-[1fr_100px_120px_auto]"
                  >
                    <div>
                      <input
                        type="text"
                        value={row.description}
                        onChange={(e) => {
                          const value = e.target.value;
                          setItems((prev) =>
                            prev.map((r) => (r.key === row.key ? { ...r, description: value } : r)),
                          );
                          clearItemRowError(row.key, 'description');
                        }}
                        placeholder={`Descrição do item ${index + 1}`}
                        className={fieldClass(Boolean(rowErr?.description))}
                        disabled={saving}
                      />
                      <FieldError message={rowErr?.description} />
                    </div>
                    <div>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={row.quantity}
                        onChange={(e) => {
                          setItems((prev) =>
                            prev.map((r) => (r.key === row.key ? { ...r, quantity: e.target.value } : r)),
                          );
                          clearItemRowError(row.key, 'quantity');
                        }}
                        placeholder="Qtd"
                        className={fieldClass(Boolean(rowErr?.quantity))}
                        disabled={saving}
                      />
                      <FieldError message={rowErr?.quantity} />
                    </div>
                    <div>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.unitPrice}
                        onChange={(e) => {
                          setItems((prev) =>
                            prev.map((r) => (r.key === row.key ? { ...r, unitPrice: e.target.value } : r)),
                          );
                          clearItemRowError(row.key, 'unitPrice');
                        }}
                        placeholder="Preço unit."
                        className={fieldClass(Boolean(rowErr?.unitPrice))}
                        disabled={saving}
                      />
                      <FieldError message={rowErr?.unitPrice} />
                    </div>
                    <div className="flex items-start justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          setItems((prev) =>
                            prev.length > 1 ? prev.filter((r) => r.key !== row.key) : prev,
                          )
                        }
                        disabled={saving || items.length <= 1}
                        className="rounded-md p-2 text-rose-400 hover:bg-rose-500/10 disabled:opacity-30"
                        aria-label="Remover item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {submitError ? (
            <p className="text-sm text-rose-500" role="alert">
              {submitError}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border-color)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving || loadingOptions}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Criar venda externa
          </button>
        </div>
      </div>
    </div>
  );
}
