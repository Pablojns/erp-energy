'use client';

import { useCallback, useEffect, useState } from 'react';
import { Package, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

type AdminUser = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  roles: string[];
};

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

  useEffect(() => {
    let cancelled = false;
    erpFetchJson<AdminUser[]>('auth/users')
      .then((data) => {
        if (!cancelled) setUsers(Array.isArray(data) ? data : []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Falha ao buscar usuários.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <StateMessage>Carregando usuários...</StateMessage>;
  if (error) return <StateMessage>{error}</StateMessage>;
  if (users.length === 0) {
    return <StateMessage>Nenhum usuário cadastrado.</StateMessage>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm text-zinc-300">
        <thead className="bg-white/5 text-xs font-semibold uppercase text-zinc-500">
          <tr>
            <th className="px-6 py-4">Nome</th>
            <th className="px-6 py-4">Email</th>
            <th className="px-6 py-4">Perfis</th>
            <th className="px-6 py-4">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {users.map((user) => (
            <tr key={user.id} className="transition-colors hover:bg-white/5">
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
            </tr>
          ))}
        </tbody>
      </table>
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
