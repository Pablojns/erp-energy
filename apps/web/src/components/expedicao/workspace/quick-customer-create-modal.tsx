'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  deliveryAddress?: string | null;
};

type ExistingCustomer = {
  id: string;
  name: string;
  cnpj: string | null;
  deliveryAddress?: string | null;
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

type BrasilApiCnpj = {
  razao_social?: string;
  nome_fantasia?: string;
  cnpj?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  ddd_telefone_1?: string;
  email?: string;
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

async function lookupCnpjBrasilApi(cnpjDigits: string): Promise<Partial<FormState> | null> {
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`);
  if (!res.ok) return null;
  const data = (await res.json()) as BrasilApiCnpj;
  const razao = data.razao_social?.trim() || data.nome_fantasia?.trim() || '';
  if (!razao && !data.cnpj) return null;

  const cepDigits = digitsOnly(data.cep ?? '');
  const hasAddress = cepDigits.length === 8 || Boolean(data.logradouro?.trim());

  return {
    name: razao,
    cnpj: formatCpfCnpj(data.cnpj ?? cnpjDigits),
    phone: data.ddd_telefone_1?.trim() || '',
    email: data.email?.trim() || '',
    address: {
      cep: cepDigits.length === 8 ? formatCep(cepDigits) : '',
      logradouro: data.logradouro?.trim() ?? '',
      bairro: data.bairro?.trim() ?? '',
      cidade: data.municipio?.trim() ?? '',
      uf: data.uf?.trim().toUpperCase() ?? '',
      numero: data.numero?.trim() ?? '',
      complemento: data.complemento?.trim() ?? '',
    },
    addressLoaded: hasAddress,
  };
}

export function QuickCustomerCreateModal(props: {
  open: boolean;
  initialCnpj?: string;
  onClose: () => void;
  onCreated: (customer: QuickCustomerCreated) => void;
}) {
  const { open, initialCnpj, onClose, onCreated } = props;
  const [form, setForm] = useState<FormState>(() => emptyForm(initialCnpj));
  const [searchQuery, setSearchQuery] = useState('');
  const [existingCustomers, setExistingCustomers] = useState<ExistingCustomer[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupHint, setLookupHint] = useState<string | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lookupSeq = useRef(0);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm(initialCnpj));
    setSearchQuery(initialCnpj?.trim() ? formatCpfCnpj(initialCnpj) : '');
    setCepError(null);
    setError(null);
    setLookupHint(null);
    void erpFetchJson<ExistingCustomer[]>('cadastros/customers')
      .then((rows) =>
        setExistingCustomers(
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
      .catch(() => setExistingCustomers([]));
  }, [open, initialCnpj]);

  const nameSuggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const qDigits = digitsOnly(searchQuery);
    if (q.length < 2 || qDigits.length >= 11) return [];
    return existingCustomers
      .filter((c) => {
        const name = c.name.toLowerCase();
        const cnpj = (c.cnpj ?? '').toLowerCase();
        return name.includes(q) || cnpj.includes(q);
      })
      .slice(0, 8);
  }, [existingCustomers, searchQuery]);

  useEffect(() => {
    if (!open) return;
    const qDigits = digitsOnly(searchQuery);
    if (qDigits.length !== 14) return;

    const seq = ++lookupSeq.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLookupLoading(true);
        setLookupHint(null);
        try {
          const local = existingCustomers.find(
            (c) => digitsOnly(c.cnpj ?? '') === qDigits,
          );
          if (local) {
            if (seq !== lookupSeq.current) return;
            setForm((prev) => ({
              ...prev,
              name: local.name,
              cnpj: formatCpfCnpj(local.cnpj ?? qDigits),
            }));
            setLookupHint(`Cliente já cadastrado: ${local.name}`);
            return;
          }

          const fromApi = await lookupCnpjBrasilApi(qDigits);
          if (seq !== lookupSeq.current) return;
          if (!fromApi) {
            setLookupHint('CNPJ não encontrado na consulta pública.');
            setForm((prev) => ({
              ...prev,
              cnpj: formatCpfCnpj(qDigits),
            }));
            return;
          }
          setForm((prev) => ({
            ...prev,
            ...fromApi,
            address: fromApi.address ?? prev.address,
            addressLoaded: fromApi.addressLoaded ?? prev.addressLoaded,
          }));
          setLookupHint('Razão social preenchida pela consulta de CNPJ.');
        } catch {
          if (seq !== lookupSeq.current) return;
          setLookupHint('Não foi possível consultar o CNPJ agora.');
        } finally {
          if (seq === lookupSeq.current) setLookupLoading(false);
        }
      })();
    }, 400);

    return () => window.clearTimeout(timer);
  }, [open, searchQuery, existingCustomers]);

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

  const applyExistingCustomer = (customer: ExistingCustomer) => {
    onCreated({
      id: customer.id,
      name: customer.name,
      cnpj: customer.cnpj,
      isActive: true,
      deliveryAddress: customer.deliveryAddress ?? null,
    });
    onClose();
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
      const deliveryAddress = serializeDeliveryAddress({
        ...form.address,
        numero: form.address.numero.trim(),
      });
      const created = await erpFetchJson<QuickCustomerCreated>('cadastros/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          cnpj: form.cnpj.trim(),
          inscricaoEstadual: form.inscricaoEstadual.trim() || undefined,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          deliveryAddress,
        }),
      });
      onCreated({
        ...created,
        deliveryAddress: created.deliveryAddress ?? deliveryAddress,
      });
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
          <div className="relative space-y-1">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--text-secondary)]">
                Busca (CNPJ ou razão social)
              </span>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSearchQuery(next);
                    const dig = digitsOnly(next);
                    if (dig.length >= 11) {
                      patch({ cnpj: formatCpfCnpj(next) });
                    } else if (next.trim() && dig.length < 8) {
                      patch({ name: next.trim() });
                    }
                  }}
                  className={`${fieldClass(saving)} pr-9`}
                  disabled={saving}
                  placeholder="Digite CNPJ ou nome…"
                  autoFocus
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                  {lookupLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </span>
              </div>
            </label>
            {lookupHint ? (
              <p className="text-[11px] text-[var(--text-secondary)]">{lookupHint}</p>
            ) : null}
            {nameSuggestions.length > 0 ? (
              <ul className="absolute left-0 right-0 z-20 mt-1 max-h-40 overflow-y-auto rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] py-1 shadow-lg">
                {nameSuggestions.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start px-2.5 py-1.5 text-left hover:bg-[var(--input-bg)]"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyExistingCustomer(c);
                      }}
                    >
                      <span className="text-[12px] font-medium text-[var(--text-primary)]">
                        {c.name}
                      </span>
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        {c.cnpj ?? '—'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

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
                onChange={(e) => {
                  const formatted = formatCpfCnpj(e.target.value);
                  patch({ cnpj: formatted });
                  setSearchQuery(formatted);
                }}
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
