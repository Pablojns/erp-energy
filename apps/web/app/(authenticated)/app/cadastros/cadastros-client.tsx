'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  MapPin,
  Pencil,
  Plus,
  Power,
  Truck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import {
  CustomerFormFields,
  customerFormToApiPayload,
  emptyCustomerFormValues,
  validateCustomerForm,
  type CustomerFormValues,
} from '@/src/components/cadastros/customer-form-fields';
import { formatCpfCnpj } from '@/src/components/cadastros/document-mask';
import {
  formatDeliveryAddressDisplay,
  parseDeliveryAddress,
} from '@/src/components/cadastros/delivery-address';

type CadastroTab =
  | 'receivers'
  | 'unloading-points'
  | 'carriers'
  | 'suppliers'
  | 'customers';

type NameCadastro = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type SupplierCadastro = NameCadastro & {
  cnpj: string | null;
};

type CustomerCadastro = NameCadastro & {
  cnpj: string | null;
  deliveryAddress: string | null;
};

type CadastroRow = NameCadastro | SupplierCadastro | CustomerCadastro;

type TabConfig = {
  id: CadastroTab;
  label: string;
  icon: React.ReactNode;
  apiPath: string;
  entityLabel: string;
  columns: Array<{ key: string; header: string }>;
};

const TABS: TabConfig[] = [
  {
    id: 'receivers',
    label: 'Recebedores',
    icon: <UserCheck size={16} />,
    apiPath: 'cadastros/receivers',
    entityLabel: 'Recebedor',
    columns: [
      { key: 'name', header: 'Nome' },
      { key: 'status', header: 'Status' },
    ],
  },
  {
    id: 'unloading-points',
    label: 'Pontos de Descarga',
    icon: <MapPin size={16} />,
    apiPath: 'cadastros/unloading-points',
    entityLabel: 'Ponto de Descarga',
    columns: [
      { key: 'name', header: 'Nome' },
      { key: 'status', header: 'Status' },
    ],
  },
  {
    id: 'carriers',
    label: 'Transportadoras',
    icon: <Truck size={16} />,
    apiPath: 'cadastros/carriers',
    entityLabel: 'Transportadora',
    columns: [
      { key: 'name', header: 'Nome' },
      { key: 'status', header: 'Status' },
    ],
  },
  {
    id: 'suppliers',
    label: 'Fornecedores',
    icon: <Building2 size={16} />,
    apiPath: 'cadastros/suppliers',
    entityLabel: 'Fornecedor',
    columns: [
      { key: 'name', header: 'Nome' },
      { key: 'cnpj', header: 'CNPJ' },
      { key: 'status', header: 'Status' },
    ],
  },
  {
    id: 'customers',
    label: 'Clientes',
    icon: <Users size={16} />,
    apiPath: 'cadastros/customers',
    entityLabel: 'Cliente',
    columns: [
      { key: 'name', header: 'Nome' },
      { key: 'cnpj', header: 'CNPJ/CPF' },
      { key: 'deliveryAddress', header: 'Endereço de entrega' },
      { key: 'status', header: 'Status' },
    ],
  },
];

function tabById(id: CadastroTab) {
  return TABS.find((t) => t.id === id) ?? TABS[0];
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        active
          ? 'bg-emerald-500/15 text-emerald-300'
          : 'bg-zinc-500/20 text-zinc-400'
      }`}
    >
      {active ? 'Ativo' : 'Inativo'}
    </span>
  );
}

function StateMessage({ children }: { children: React.ReactNode }) {
  return <div className="p-8 text-center text-sm text-zinc-400">{children}</div>;
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-600 text-white shadow'
          : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ModalShell({
  title,
  icon,
  onClose,
  onConfirm,
  confirmLabel,
  saving,
  children,
  wide,
}: {
  title: string;
  icon: React.ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  saving: boolean;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Fechar"
        onClick={onClose}
        disabled={saving}
      />
      <div
        className={`relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[#121724] shadow-xl ${
          wide ? 'max-w-lg' : 'max-w-md'
        }`}
        role="dialog"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
            {icon}
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md p-1 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
          >
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {children}
        </div>
        <div className="flex shrink-0 gap-3 border-t border-white/10 bg-white/[0.02] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function fieldInputClass() {
  return 'w-full rounded-lg border border-white/10 bg-[#0d1117] px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500';
}

type CadastroFormState = {
  name: string;
  cnpj: string;
};

function buildCustomerFormValues(row: CustomerCadastro | null): CustomerFormValues {
  const parsed = parseDeliveryAddress(row?.deliveryAddress);
  return {
    name: row?.name ?? '',
    document: row?.cnpj ? formatCpfCnpj(row.cnpj) : '',
    address: parsed ?? emptyCustomerFormValues().address,
    addressLoaded: Boolean(parsed),
  };
}

function CustomerCadastroModal({
  mode,
  tab,
  row,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  tab: TabConfig;
  row: CustomerCadastro | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CustomerFormValues>(() =>
    buildCustomerFormValues(row),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const legacyAddress =
    row?.deliveryAddress && !parseDeliveryAddress(row.deliveryAddress)
      ? row.deliveryAddress
      : null;

  const handleSubmit = async () => {
    const validationError = validateCustomerForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const body = customerFormToApiPayload(form);
      if (mode === 'create') {
        await erpFetchJson(tab.apiPath, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      } else if (row) {
        await erpFetchJson(`${tab.apiPath}/${row.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...body,
            cnpj: body.cnpj ?? null,
            deliveryAddress: body.deliveryAddress ?? null,
          }),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const title =
    mode === 'create' ? `Novo ${tab.entityLabel}` : `Editar ${tab.entityLabel}`;

  return (
    <ModalShell
      title={title}
      icon={mode === 'create' ? <Plus size={20} /> : <Pencil size={20} />}
      onClose={onClose}
      onConfirm={() => void handleSubmit()}
      confirmLabel={saving ? 'Salvando...' : 'Salvar'}
      saving={saving}
      wide
    >
      <CustomerFormFields
        values={form}
        onChange={setForm}
        disabled={saving}
        legacyAddress={legacyAddress}
        error={error}
        onClearError={() => setError(null)}
      />
    </ModalShell>
  );
}

function CadastroFormModal({
  mode,
  tab,
  row,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  tab: TabConfig;
  row: CadastroRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CadastroFormState>(() => ({
    name: row?.name ?? '',
    cnpj: 'cnpj' in (row ?? {}) ? formatCpfCnpj((row as SupplierCadastro).cnpj ?? '') : '',
  }));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const validate = (): string | null => {
    if (!form.name.trim()) return 'Informe o nome.';
    return null;
  };

  const buildBody = () => {
    if (tab.id === 'suppliers') {
      return {
        name: form.name.trim(),
        ...(form.cnpj.trim() ? { cnpj: form.cnpj.trim() } : {}),
      };
    }
    return { name: form.name.trim() };
  };

  const buildEditBody = () => {
    if (tab.id === 'suppliers') {
      return {
        name: form.name.trim(),
        cnpj: form.cnpj.trim() || null,
      };
    }
    return { name: form.name.trim() };
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (mode === 'create') {
        await erpFetchJson(tab.apiPath, {
          method: 'POST',
          body: JSON.stringify(buildBody()),
        });
      } else if (row) {
        await erpFetchJson(`${tab.apiPath}/${row.id}`, {
          method: 'PATCH',
          body: JSON.stringify(buildEditBody()),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const title =
    mode === 'create'
      ? `Novo ${tab.entityLabel}`
      : `Editar ${tab.entityLabel}`;

  return (
    <ModalShell
      title={title}
      icon={mode === 'create' ? <Plus size={20} /> : <Pencil size={20} />}
      onClose={onClose}
      onConfirm={() => void handleSubmit()}
      confirmLabel={saving ? 'Salvando...' : 'Salvar'}
      saving={saving}
    >
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-zinc-300">
          Nome <span className="text-rose-400">*</span>
        </span>
        <input
          type="text"
          value={form.name}
          onChange={(e) => {
            setForm((f) => ({ ...f, name: e.target.value }));
            setError(null);
          }}
          className={fieldInputClass()}
          placeholder="Nome"
          autoFocus
        />
      </label>

      {tab.id === 'suppliers' ? (
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-zinc-300">CNPJ</span>
          <input
            type="text"
            inputMode="numeric"
            value={form.cnpj}
            onChange={(e) => {
              setForm((f) => ({ ...f, cnpj: formatCpfCnpj(e.target.value) }));
              setError(null);
            }}
            className={fieldInputClass()}
            placeholder="00.000.000/0000-00"
            maxLength={18}
          />
        </label>
      ) : null}

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
    </ModalShell>
  );
}

function CadastroTable({
  tab,
  isAdmin,
}: {
  tab: TabConfig;
  isAdmin: boolean;
}) {
  const [rows, setRows] = useState<CadastroRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editRow, setEditRow] = useState<CadastroRow | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    erpFetchJson<CadastroRow[]>(tab.apiPath)
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : 'Falha ao carregar registros.',
        );
      })
      .finally(() => setLoading(false));
  }, [tab.apiPath]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const toggleActive = async (row: CadastroRow) => {
    const next = !row.isActive;
    const action = next ? 'ativar' : 'inativar';
    if (
      !confirm(
        `${action.charAt(0).toUpperCase() + action.slice(1)} "${row.name}"?`,
      )
    ) {
      return;
    }

    setTogglingId(row.id);
    try {
      await erpFetchJson(`${tab.apiPath}/${row.id}/toggle`, { method: 'PATCH' });
      setToast(next ? 'Registro ativado.' : 'Registro inativado.');
      load();
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Falha ao alterar status.');
    } finally {
      setTogglingId(null);
    }
  };

  const renderCell = (row: CadastroRow, key: string) => {
    if (key === 'status') return <StatusBadge active={row.isActive} />;
    if (key === 'cnpj') {
      const value = 'cnpj' in row ? row.cnpj : null;
      return <span className="text-zinc-300">{value || '—'}</span>;
    }
    if (key === 'deliveryAddress') {
      const value =
        'deliveryAddress' in row ? row.deliveryAddress : null;
      const display = formatDeliveryAddressDisplay(value);
      return (
        <span className="block max-w-xs truncate text-zinc-300" title={display}>
          {display}
        </span>
      );
    }
    if (key === 'name') {
      return <span className="font-medium text-zinc-100">{row.name}</span>;
    }
    return '—';
  };

  return (
    <div>
      {toast ? (
        <div
          role="status"
          className="border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200"
        >
          {toast}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <p className="text-sm text-zinc-400">
          {rows.length} registro{rows.length === 1 ? '' : 's'}
        </p>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => {
              setEditRow(null);
              setModalMode('create');
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            <Plus size={16} />
            Novo
          </button>
        ) : null}
      </div>

      {loading ? <StateMessage>Carregando...</StateMessage> : null}
      {!loading && error ? <StateMessage>{error}</StateMessage> : null}
      {!loading && !error && rows.length === 0 ? (
        <StateMessage>Nenhum registro encontrado.</StateMessage>
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-zinc-500">
                {tab.columns.map((col) => (
                  <th key={col.key} className="px-4 py-3 font-semibold">
                    {col.header}
                  </th>
                ))}
                {isAdmin ? (
                  <th className="px-4 py-3 text-right font-semibold">Ações</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-white/5 transition hover:bg-white/[0.02]"
                >
                  {tab.columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      {renderCell(row, col.key)}
                    </td>
                  ))}
                  {isAdmin ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditRow(row);
                            setModalMode('edit');
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/5"
                          title="Editar"
                        >
                          <Pencil size={14} />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleActive(row)}
                          disabled={togglingId === row.id}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                            row.isActive
                              ? 'border-rose-500/30 text-rose-300 hover:bg-rose-500/10'
                              : 'border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10'
                          }`}
                          title={row.isActive ? 'Inativar' : 'Ativar'}
                        >
                          <Power size={14} />
                          {row.isActive ? 'Inativar' : 'Ativar'}
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {modalMode ? (
        tab.id === 'customers' ? (
          <CustomerCadastroModal
            mode={modalMode}
            tab={tab}
            row={
              modalMode === 'edit' ? (editRow as CustomerCadastro | null) : null
            }
            onClose={() => {
              setModalMode(null);
              setEditRow(null);
            }}
            onSaved={() => {
              setModalMode(null);
              setEditRow(null);
              setToast(
                modalMode === 'create'
                  ? 'Registro criado com sucesso!'
                  : 'Registro atualizado com sucesso!',
              );
              load();
            }}
          />
        ) : (
          <CadastroFormModal
            mode={modalMode}
            tab={tab}
            row={modalMode === 'edit' ? editRow : null}
            onClose={() => {
              setModalMode(null);
              setEditRow(null);
            }}
            onSaved={() => {
              setModalMode(null);
              setEditRow(null);
              setToast(
                modalMode === 'create'
                  ? 'Registro criado com sucesso!'
                  : 'Registro atualizado com sucesso!',
              );
              load();
            }}
          />
        )
      ) : null}
    </div>
  );
}

export function CadastrosClient({ isAdmin }: { isAdmin: boolean }) {
  const [activeTab, setActiveTab] = useState<CadastroTab>('receivers');
  const tab = tabById(activeTab);

  return (
    <div className="space-y-4">
      <div className="flex w-full flex-wrap gap-1 rounded-xl border border-white/10 bg-[#121724] p-1">
        {TABS.map((item) => (
          <TabButton
            key={item.id}
            active={activeTab === item.id}
            onClick={() => setActiveTab(item.id)}
            icon={item.icon}
            label={item.label}
          />
        ))}
      </div>

      <section className="min-h-[320px] overflow-hidden rounded-2xl border border-white/10 bg-[#121724]">
        <CadastroTable key={activeTab} tab={tab} isAdmin={isAdmin} />
      </section>
    </div>
  );
}
