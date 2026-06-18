'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  KeyRound,
  Package,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

type AdminUser = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  roles: string[];
};

type UserRole = 'ADMIN' | 'OPERADOR';

type NewUserForm = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
};

const EMPTY_USER_FORM: NewUserForm = {
  name: '',
  email: '',
  password: '',
  role: 'OPERADOR',
};

function primaryRole(user: AdminUser): UserRole {
  return user.roles.includes('ADMIN') ? 'ADMIN' : 'OPERADOR';
}

type InactiveProduct = {
  id: string;
  internalCode: string;
  sku: string;
  name: string;
  category: string | null;
  price: string;
  stockQty: number;
  updatedAt: string;
};

type ProductListResponse = {
  data: InactiveProduct[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

type Tab = 'users' | 'products';

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function ConfiguracoesAdminClient() {
  const [activeTab, setActiveTab] = useState<Tab>('users');

  return (
    <div className="space-y-4">
      <div className="flex w-fit gap-1 rounded-xl border border-white/10 bg-[#121724] p-1">
        <TabButton
          active={activeTab === 'users'}
          onClick={() => setActiveTab('users')}
          icon={<Users size={16} />}
          label="Usuários"
        />
        <TabButton
          active={activeTab === 'products'}
          onClick={() => setActiveTab('products')}
          icon={<Package size={16} />}
          label="Produtos Inativos"
        />
      </div>

      <section className="min-h-[320px] overflow-hidden rounded-2xl border border-white/10 bg-[#121724]">
        {activeTab === 'users' ? <UsersTable /> : <InactiveProductsTable />}
      </section>
    </div>
  );
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

function StateMessage({ children }: { children: React.ReactNode }) {
  return <div className="p-8 text-center text-sm text-zinc-400">{children}</div>;
}

function UsersTable() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    erpFetchJson<AdminUser[]>('auth/users')
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Falha ao buscar usuários.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const handleUserCreated = () => {
    setModalOpen(false);
    setToast('Usuário criado com sucesso!');
    load();
  };

  const handleUserUpdated = () => {
    setEditUser(null);
    setToast('Usuário atualizado com sucesso!');
    load();
  };

  const handlePasswordReset = () => {
    setResetUser(null);
    setToast('Senha redefinida com sucesso!');
  };

  const toggleActive = async (user: AdminUser) => {
    const next = !user.isActive;
    const action = next ? 'ativar' : 'inativar';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} o usuário "${user.name}"?`)) {
      return;
    }

    setTogglingId(user.id);
    try {
      await erpFetchJson<AdminUser>(`auth/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: next }),
      });
      setToast(next ? 'Usuário ativado.' : 'Usuário inativado.');
      load();
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Falha ao alterar status.');
    } finally {
      setTogglingId(null);
    }
  };

  const modals = (
    <>
      {modalOpen ? (
        <NewUserModal onClose={() => setModalOpen(false)} onCreated={handleUserCreated} />
      ) : null}
      {editUser ? (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={handleUserUpdated}
        />
      ) : null}
      {resetUser ? (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onSaved={handlePasswordReset}
        />
      ) : null}
    </>
  );

  if (loading) {
    return (
      <>
        <UsersTableToolbar onNew={() => setModalOpen(true)} />
        <StateMessage>Carregando usuários...</StateMessage>
        {modals}
      </>
    );
  }

  if (error) {
    return (
      <>
        <UsersTableToolbar onNew={() => setModalOpen(true)} />
        <div className="space-y-3 p-8 text-center">
          <p className="text-sm text-rose-400">{error}</p>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
          >
            <RefreshCw size={14} />
            Tentar novamente
          </button>
        </div>
        {modals}
      </>
    );
  }

  return (
    <>
      <UsersTableToolbar onNew={() => setModalOpen(true)} />
      {toast ? (
        <div
          role="status"
          className="mx-4 mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300"
        >
          {toast}
        </div>
      ) : null}
      {users.length === 0 ? (
        <StateMessage>Nenhum usuário cadastrado.</StateMessage>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead className="bg-white/5 text-xs font-semibold uppercase text-zinc-500">
              <tr>
                <th className="px-6 py-4">Nome</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Perfis</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map((user) => (
                <tr
                  key={user.id}
                  className={`transition-colors hover:bg-white/5 ${
                    user.isActive ? '' : 'opacity-50'
                  }`}
                >
                  <td className="px-6 py-4 font-medium text-zinc-100">{user.name}</td>
                  <td className="px-6 py-4">{user.email}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {user.roles.map((role) => (
                        <span
                          key={role}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            role === 'ADMIN'
                              ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-blue-500/15 text-blue-300'
                          }`}
                        >
                          {role === 'ADMIN' ? <ShieldCheck size={12} /> : null}
                          {role}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        user.isActive
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-rose-500/15 text-rose-300'
                      }`}
                    >
                      {user.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditUser(user)}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/5"
                      >
                        <Pencil size={13} />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setResetUser(user)}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/5"
                      >
                        <KeyRound size={13} />
                        Resetar Senha
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleActive(user)}
                        disabled={togglingId === user.id}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                          user.isActive
                            ? 'border-rose-500/30 text-rose-300 hover:bg-rose-500/10'
                            : 'border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10'
                        }`}
                      >
                        <Power size={13} className={togglingId === user.id ? 'animate-spin' : ''} />
                        {user.isActive ? 'Inativar' : 'Ativar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modals}
    </>
  );
}

function UsersTableToolbar(props: { onNew: () => void }) {
  return (
    <div className="flex items-center justify-end border-b border-white/5 px-4 py-3">
      <button
        type="button"
        onClick={props.onNew}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
      >
        <Plus size={16} />
        Novo Usuário
      </button>
    </div>
  );
}

function EditUserModal(props: {
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user, onClose, onSaved } = props;
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<UserRole>(primaryRole(user));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Informe o nome.');
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('E-mail inválido.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await erpFetchJson<AdminUser>(`auth/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role,
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar usuário.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Editar Usuário"
      icon={<Pencil size={20} />}
      onClose={onClose}
      saving={saving}
      onConfirm={() => void handleSubmit()}
      confirmLabel={saving ? 'Salvando...' : 'Salvar'}
    >
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-zinc-300">Nome</span>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          className="w-full rounded-lg border border-white/10 bg-[#0d1117] px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-zinc-300">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          className="w-full rounded-lg border border-white/10 bg-[#0d1117] px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-zinc-300">Perfil</span>
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value as UserRole);
            setError(null);
          }}
          className="w-full rounded-lg border border-white/10 bg-[#0d1117] px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="OPERADOR">OPERADOR</option>
          <option value="ADMIN">ADMIN</option>
        </select>
      </label>
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
    </ModalShell>
  );
}

function ResetPasswordModal(props: {
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user, onClose, onSaved } = props;
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (password.length < 6) {
      setError('Senha deve ter no mínimo 6 caracteres.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await erpFetchJson(`auth/users/${user.id}/reset-password`, {
        method: 'PATCH',
        body: JSON.stringify({ password }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao redefinir senha.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Resetar Senha"
      icon={<KeyRound size={20} />}
      onClose={onClose}
      saving={saving}
      onConfirm={() => void handleSubmit()}
      confirmLabel={saving ? 'Salvando...' : 'Confirmar'}
    >
      <p className="text-sm text-zinc-400">
        Usuário: <span className="font-medium text-zinc-200">{user.name}</span>
      </p>
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-zinc-300">Nova senha</span>
        <input
          type="text"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          className="w-full rounded-lg border border-white/10 bg-[#0d1117] px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Mínimo 6 caracteres"
          autoComplete="new-password"
          autoFocus
        />
      </label>
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
    </ModalShell>
  );
}

function ModalShell(props: {
  title: string;
  icon: React.ReactNode;
  onClose: () => void;
  saving: boolean;
  onConfirm: () => void;
  confirmLabel: string;
  children: React.ReactNode;
}) {
  const { title, icon, onClose, saving, onConfirm, confirmLabel, children } = props;

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
        className="relative w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-[#121724] shadow-xl"
        role="dialog"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
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
        <div className="space-y-4 px-5 py-5">{children}</div>
        <div className="flex gap-3 border-t border-white/10 bg-white/[0.02] px-5 py-4">
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

function NewUserModal(props: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { onClose, onCreated } = props;
  const [form, setForm] = useState<NewUserForm>(EMPTY_USER_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const validate = (): string | null => {
    if (!form.name.trim()) return 'Informe o nome.';
    if (!form.email.trim()) return 'Informe o e-mail.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return 'E-mail inválido.';
    }
    if (form.password.length < 6) return 'Senha deve ter no mínimo 6 caracteres.';
    return null;
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
      await erpFetchJson('auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          role: form.role,
        }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar usuário.');
    } finally {
      setSaving(false);
    }
  };

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
        className="relative w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-[#121724] shadow-xl"
        role="dialog"
        aria-labelledby="new-user-title"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 id="new-user-title" className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
            <UserPlus size={20} />
            Novo Usuário
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

        <div className="space-y-4 px-5 py-5">
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
              className="w-full rounded-lg border border-white/10 bg-[#0d1117] px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Nome completo"
              autoFocus
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-zinc-300">
              Email <span className="text-rose-400">*</span>
            </span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => {
                setForm((f) => ({ ...f, email: e.target.value }));
                setError(null);
              }}
              className="w-full rounded-lg border border-white/10 bg-[#0d1117] px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="usuario@empresa.com"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-zinc-300">
              Senha temporária <span className="text-rose-400">*</span>
            </span>
            <input
              type="text"
              value={form.password}
              onChange={(e) => {
                setForm((f) => ({ ...f, password: e.target.value }));
                setError(null);
              }}
              className="w-full rounded-lg border border-white/10 bg-[#0d1117] px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-zinc-300">
              Perfil <span className="text-rose-400">*</span>
            </span>
            <select
              value={form.role}
              onChange={(e) => {
                setForm((f) => ({ ...f, role: e.target.value as UserRole }));
                setError(null);
              }}
              className="w-full rounded-lg border border-white/10 bg-[#0d1117] px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="OPERADOR">OPERADOR</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </label>

          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
        </div>

        <div className="flex gap-3 border-t border-white/10 bg-white/[0.02] px-5 py-4">
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
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Criando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function InactiveProductsTable() {
  const [products, setProducts] = useState<InactiveProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    erpFetchJson<ProductListResponse>(
      'products?status=inactive&pageSize=100&sortBy=updatedAt&sortOrder=desc',
    )
      .then((res) => setProducts(res.data ?? []))
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : 'Falha ao buscar produtos.',
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const reactivate = async (product: InactiveProduct) => {
    if (!confirm(`Reativar o produto "${product.name}"?`)) return;

    setReactivatingId(product.id);
    try {
      await erpFetchJson(`products/${product.id}/reactivate`, {
        method: 'PATCH',
      });
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
    } catch (err) {
      alert(
        err instanceof Error ? err.message : 'Erro ao reativar produto.',
      );
    } finally {
      setReactivatingId(null);
    }
  };

  if (loading) return <StateMessage>Carregando produtos inativos...</StateMessage>;
  if (error) return <StateMessage>{error}</StateMessage>;
  if (products.length === 0) {
    return <StateMessage>Nenhum produto inativo encontrado.</StateMessage>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm text-zinc-300">
        <thead className="bg-white/5 text-xs font-semibold uppercase text-zinc-500">
          <tr>
            <th className="px-6 py-4">Produto</th>
            <th className="px-6 py-4">SKU</th>
            <th className="px-6 py-4">Categoria</th>
            <th className="px-6 py-4">Preço</th>
            <th className="px-6 py-4">Estoque</th>
            <th className="px-6 py-4 text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {products.map((product) => (
            <tr key={product.id} className="transition-colors hover:bg-white/5">
              <td className="px-6 py-4 font-medium text-zinc-100">
                {product.name}
              </td>
              <td className="px-6 py-4 font-mono text-xs">{product.sku}</td>
              <td className="px-6 py-4">{product.category ?? '—'}</td>
              <td className="px-6 py-4">{currency.format(Number(product.price))}</td>
              <td className="px-6 py-4">{product.stockQty}</td>
              <td className="px-6 py-4 text-right">
                <button
                  type="button"
                  onClick={() => reactivate(product)}
                  disabled={reactivatingId === product.id}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw
                    size={14}
                    className={reactivatingId === product.id ? 'animate-spin' : ''}
                  />
                  {reactivatingId === product.id ? 'Reativando...' : 'Reativar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
