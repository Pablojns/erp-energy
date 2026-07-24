'use client';

import { useEffect, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { formatCpfCnpj, digitsOnly } from '@/src/components/cadastros/document-mask';
import {
  emptyDeliveryAddressForm,
  fetchAddressByCep,
  formatCep,
  serializeDeliveryAddress,
  type DeliveryAddressForm,
} from '@/src/components/cadastros/delivery-address';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

export type QuickCustomerCreated = {
  id: string;
  name: string;
  cnpj: string | null;
  isActive: boolean;
};

type FormState = {
  name: string;
  cnpj: string;
  inscricaoEstadual: string;
  phone: string;
  email: string;
  address: DeliveryAddressForm;
  addressLoaded: boolean;
};

function emptyForm(initialCnpj?: string): FormState {
  return {
    name: '',
    cnpj: initialCnpj?.trim() ? formatCpfCnpj(initialCnpj) : '',
    inscricaoEstadual: '',
    phone: '',
    email: '',
    address: emptyDeliveryAddressForm(),
    addressLoaded: false,
  };
}

function fieldClass(disabled?: boolean) {
  return `w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)] ${
    disabled ? 'cursor-not-allowed opacity-60' : ''
  }`;
}

export function QuickCustomerCreateModal(props: {
  open: boolean;
  initialCnpj?: string;
  onClose: () => void;
  onCreated: (customer: QuickCustomerCreated) => void;
}) {
  const { open, initialCnpj, onClose, onCreated } = props;
  const [form, setForm] = useState<FormState>(() => emptyForm(initialCnpj));
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm(initialCnpj));
    setCepError(null);
    setError(null);
  }, [open, initialCnpj]);

  if (!open) return null;

  const patch = (partial: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...partial }));
    setError(null);
  };

  const patchAddress = (partial: Partial<DeliveryAddressForm>) => {
    setForm((prev) => ({
      ...prev,
      address: { ...prev.address, ...partial },
    }));
    setError(null);
  };

  const handleCepSearch = async () => {
    setCepError(null);
    setCepLoading(true);
    try {
      const found = await fetchAddressByCep(form.address.cep);
      patch({
        address: {
          ...found,
          numero: form.address.numero,
          complemento: form.address.complemento,
        },
        addressLoaded: true,
      });
    } catch (err) {
      setCepError(err instanceof Error ? err.message : 'Falha ao buscar CEP.');
      patch({ addressLoaded: false });
    } finally {
      setCepLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('Informe o nome / razão social.');
      return;
    }
    if (digitsOnly(form.cnpj).length < 11) {
      setError('Informe um CNPJ/CPF válido.');
      return;
    }
    if (!form.addressLoaded) {
      setError('Busque o CEP para preencher o endereço.');
      return;
    }
    if (!form.address.numero.trim()) {
      setError('Informe o número do endereço.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await erpFetchJson<QuickCustomerCreated>('cadastros/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          cnpj: form.cnpj.trim(),
          inscricaoEstadual: form.inscricaoEstadual.trim() || undefined,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          deliveryAddress: serializeDeliveryAddress({
            ...form.address,
            numero: form.address.numero.trim(),
          }),
        }),
      });
      onCreated(created);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao cadastrar cliente.');
    } finally {
      setSaving(false);
    }
  };

  const addressDisabled = saving || !form.addressLoaded;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[var(--color-overlay)]"
        aria-label="Fechar cadastro de cliente"
        onClick={onClose}
        disabled={saving}
      />
      <section
        role="dialog"
        aria-modal
        aria-label="Cadastrar novo cliente"
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Cadastrar novo cliente
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--input-bg)] hover:text-[var(--text-primary)]"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--text-secondary)]">
              Nome / Razão Social <span className="text-rose-400">*</span>
            </span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              className={fieldClass(saving)}
              disabled={saving}
              autoFocus
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--text-secondary)]">
                CNPJ <span className="text-rose-400">*</span>
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={form.cnpj}
                onChange={(e) => patch({ cnpj: formatCpfCnpj(e.target.value) })}
                className={fieldClass(saving)}
                disabled={saving}
                maxLength={18}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--text-secondary)]">
                Inscrição Estadual
              </span>
              <input
                type="text"
                value={form.inscricaoEstadual}
                onChange={(e) => patch({ inscricaoEstadual: e.target.value })}
                className={fieldClass(saving)}
                disabled={saving}
              />
            </label>
          </div>

          <div className="space-y-2 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)]/40 p-3">
            <p className="text-sm font-medium text-[var(--text-primary)]">Endereço</p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block min-w-[140px] flex-1 text-sm">
                <span className="mb-1 block font-medium text-[var(--text-secondary)]">
                  CEP <span className="text-rose-400">*</span>
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.address.cep}
                  onChange={(e) => {
                    patchAddress({ cep: formatCep(e.target.value) });
                    if (form.addressLoaded) patch({ addressLoaded: false });
                    setCepError(null);
                  }}
                  className={fieldClass(saving)}
                  disabled={saving}
                  maxLength={9}
                />
              </label>
              <button
                type="button"
                onClick={() => void handleCepSearch()}
                disabled={
                  saving || cepLoading || digitsOnly(form.address.cep).length !== 8
                }
                className="erp-focus-ring erp-btn erp-btn-primary erp-btn--md inline-flex h-[38px] items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cepLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Buscar
              </button>
            </div>
            {cepError ? <p className="text-xs text-rose-500">{cepError}</p> : null}

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--text-secondary)]">Rua</span>
              <input
                type="text"
                value={form.address.logradouro}
                onChange={(e) => patchAddress({ logradouro: e.target.value })}
                className={fieldClass(addressDisabled)}
                disabled={addressDisabled}
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[var(--text-secondary)]">
                  Número <span className="text-rose-400">*</span>
                </span>
                <input
                  type="text"
                  value={form.address.numero}
                  onChange={(e) => patchAddress({ numero: e.target.value })}
                  className={fieldClass(addressDisabled)}
                  disabled={addressDisabled}
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-[var(--text-secondary)]">
                  Complemento
                </span>
                <input
                  type="text"
                  value={form.address.complemento}
                  onChange={(e) => patchAddress({ complemento: e.target.value })}
                  className={fieldClass(addressDisabled)}
                  disabled={addressDisabled}
                />
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[var(--text-secondary)]">
                  Bairro
                </span>
                <input
                  type="text"
                  value={form.address.bairro}
                  onChange={(e) => patchAddress({ bairro: e.target.value })}
                  className={fieldClass(addressDisabled)}
                  disabled={addressDisabled}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[var(--text-secondary)]">
                  Cidade
                </span>
                <input
                  type="text"
                  value={form.address.cidade}
                  onChange={(e) => patchAddress({ cidade: e.target.value })}
                  className={fieldClass(addressDisabled)}
                  disabled={addressDisabled}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[var(--text-secondary)]">UF</span>
                <input
                  type="text"
                  value={form.address.uf}
                  onChange={(e) =>
                    patchAddress({ uf: e.target.value.toUpperCase().slice(0, 2) })
                  }
                  className={fieldClass(addressDisabled)}
                  disabled={addressDisabled}
                  maxLength={2}
                />
              </label>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--text-secondary)]">
                Telefone
              </span>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => patch({ phone: e.target.value })}
                className={fieldClass(saving)}
                disabled={saving}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--text-secondary)]">
                E-mail
              </span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => patch({ email: e.target.value })}
                className={fieldClass(saving)}
                disabled={saving}
              />
            </label>
          </div>

          {error ? <p className="text-sm text-rose-500">{error}</p> : null}
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-[var(--border-color)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="erp-focus-ring erp-btn erp-btn-secondary erp-btn--md"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="erp-focus-ring erp-btn erp-btn-primary erp-btn--md inline-flex items-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salvar e vincular
          </button>
        </footer>
      </section>
    </div>
  );
}
