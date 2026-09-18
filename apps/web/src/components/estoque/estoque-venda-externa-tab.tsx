'use client';

import { Loader2, Package, PackageMinus, PackagePlus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { GlassCard } from '@/src/components/shell/glass-card';
import { GlowButton } from '@/src/components/shell/glow-button';
import { useNavPermissions } from '@/src/components/layout/nav-permissions-context';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

type ExternalItemRow = {
  id: string;
  name: string;
  description: string | null;
  lastKnownPrice: string;
  source: string;
  stockQty: number;
};

type PaginatedExternalItems = {
  data: ExternalItemRow[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

type MovementRow = {
  id: string;
  movementType: 'INBOUND' | 'OUTBOUND';
  quantity: number;
  reference: string | null;
  notes: string | null;
  movementDate: string;
  movedBy: { id: string; name: string } | null;
};

type ExternalOrderRow = {
  itemId: string;
  sku: string;
  quantity: number;
  orderId: string;
  code: string;
  status: string;
  source: string;
  customerName: string;
  orderDate: string | null;
  orderNumber: string;
};

function money(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR');
}

function stockBadge(qty: number) {
  if (qty <= 0) {
    return {
      label: 'Sem Estoque',
      className: 'border-rose-300 bg-rose-500/10 text-rose-500',
    };
  }
  if (qty <= 2) {
    return {
      label: 'Baixo Estoque',
      className: 'border-amber-300 bg-amber-500/10 text-amber-600',
    };
  }
  return {
    label: 'Em Estoque',
    className: 'border-[#86efac] bg-[#dcfce7] text-[#16a34a]',
  };
}

export function EstoqueVendaExternaTab() {
  const router = useRouter();
  const { hasPermission } = useNavPermissions();
  const canCreate = hasPermission('estoque', 'criar');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [items, setItems] = useState<PaginatedExternalItems | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [orders, setOrders] = useState<ExternalOrderRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newQty, setNewQty] = useState('');
  const [creating, setCreating] = useState(false);

  const [entradaQty, setEntradaQty] = useState('');
  const [entradaNotes, setEntradaNotes] = useState('');
  const [savingEntrada, setSavingEntrada] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [searchDebounced]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '50');
      if (searchDebounced) params.set('search', searchDebounced);
      const res = await erpFetchJson<PaginatedExternalItems>(
        `api/estoque/venda-externa?${params.toString()}`,
      );
      setItems(res);
      setSelectedId((current) => {
        if (current && res.data.some((row) => row.id === current)) return current;
        return res.data[0]?.id ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar itens externos.');
      setItems(null);
    } finally {
      setLoading(false);
    }
  }, [page, searchDebounced]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (!selectedId) {
      setMovements([]);
      setOrders([]);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void Promise.all([
      erpFetchJson<MovementRow[]>(`api/estoque/venda-externa/${selectedId}/movements`),
      erpFetchJson<ExternalOrderRow[]>(`api/estoque/venda-externa/${selectedId}/orders`),
    ])
      .then(([moveRows, orderRows]) => {
        if (cancelled) return;
        setMovements(moveRows);
        setOrders(orderRows);
      })
      .catch(() => {
        if (cancelled) return;
        setMovements([]);
        setOrders([]);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selected = items?.data.find((row) => row.id === selectedId) ?? null;
  const movementStats = useMemo(() => {
    let inbound = 0;
    let outbound = 0;
    for (const row of movements) {
      if (row.movementType === 'INBOUND') inbound += row.quantity;
      else outbound += row.quantity;
    }
    return { inbound, outbound };
  }, [movements]);

  const handleCreate = async () => {
    const name = newName.trim();
    const price = Number(newPrice.replace(',', '.'));
    const qty = Number(newQty);
    if (!name) {
      setError('Informe o nome do item.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError('Informe um preço válido.');
      return;
    }
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await erpFetchJson<ExternalItemRow>('api/estoque/venda-externa', {
        method: 'POST',
        body: JSON.stringify({
          name,
          lastKnownPrice: price,
          source: 'Manual',
        }),
      });
      if (Number.isFinite(qty) && qty >= 1) {
        await erpFetchJson(`api/estoque/venda-externa/${created.id}/stock`, {
          method: 'POST',
          body: JSON.stringify({
            kind: 'entrada',
            quantity: Math.trunc(qty),
            notes: 'Entrada inicial',
          }),
        });
      }
      setNewName('');
      setNewPrice('');
      setNewQty('');
      setSelectedId(created.id);
      setSuccess(`Item “${created.name}” cadastrado.`);
      await loadItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao cadastrar item.');
    } finally {
      setCreating(false);
    }
  };

  const handleEntrada = async () => {
    if (!selected) return;
    const qty = Number(entradaQty);
    if (!Number.isFinite(qty) || qty < 1) {
      setError('Informe a quantidade de entrada.');
      return;
    }
    setSavingEntrada(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await erpFetchJson<{ stockQty: number; name: string }>(
        `api/estoque/venda-externa/${selected.id}/stock`,
        {
          method: 'POST',
          body: JSON.stringify({
            kind: 'entrada',
            quantity: Math.trunc(qty),
            notes: entradaNotes.trim() || undefined,
          }),
        },
      );
      setEntradaQty('');
      setEntradaNotes('');
      setSuccess(`Entrada de ${Math.trunc(qty)} un. em “${res.name}”. Saldo: ${res.stockQty}.`);
      await loadItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao registrar entrada.');
    } finally {
      setSavingEntrada(false);
    }
  };

  const badge = selected ? stockBadge(selected.stockQty) : null;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[38fr_62fr]">
      <GlassCard className="flex h-full min-h-0 flex-col overflow-hidden border-[var(--border-color)] bg-[var(--bg-card)] p-3 sm:p-4">
        <div className="mb-3 shrink-0 space-y-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] sm:text-xl">
              Visão Geral do Estoque - Itens externos
            </h3>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Saldo próprio — nunca mistura com o estoque WEG. Clique num item para ver pedidos e movimentações.
            </p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar item externo..."
              className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] py-2.5 pl-10 pr-3 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
          </div>
          {canCreate ? (
            <div className="grid grid-cols-1 gap-2 rounded-xl border border-[var(--border-color)] p-3 sm:grid-cols-[1fr_7rem_6rem_auto]">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Novo item"
                className="h-10 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 text-sm text-[var(--text-primary)] outline-none"
              />
              <input
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="Preço"
                inputMode="decimal"
                className="h-10 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 text-sm text-[var(--text-primary)] outline-none"
              />
              <input
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                placeholder="Qtd inicial"
                inputMode="numeric"
                className="h-10 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 text-sm text-[var(--text-primary)] outline-none"
              />
              <GlowButton
                variant="secondary"
                disabled={creating}
                onClick={() => void handleCreate()}
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
                Cadastrar
              </GlowButton>
            </div>
          ) : null}
        </div>
        {error ? (
          <p className="mb-2 shrink-0 text-sm text-rose-600">{error}</p>
        ) : null}
        {success ? (
          <p className="mb-2 shrink-0 text-sm text-emerald-700">{success}</p>
        ) : null}
        <div className="lista-container erp-scrollbar min-h-0 flex-1 overflow-auto pr-1">
          {loading ? (
            <p className="flex items-center gap-2 p-4 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando...
            </p>
          ) : !items?.data.length ? (
            <p className="p-4 text-sm text-[var(--text-secondary)]">
              Nenhum item externo cadastrado.
            </p>
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2">
              {items.data.map((row) => {
                const rowBadge = stockBadge(row.stockQty);
                return (
                  <div
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(row.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedId(row.id);
                      }
                    }}
                    className={`relative cursor-pointer rounded-xl border p-3 text-left transition ${
                      row.id === selectedId
                        ? 'border-2 border-[var(--accent)] bg-[var(--accent)]/10'
                        : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--input-bg)]'
                    }`}
                  >
                    <p
                      className={`truncate text-xs ${
                        row.id === selectedId
                          ? 'text-[var(--accent)]'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {row.source}
                    </p>
                    <p className="min-w-0 truncate text-sm font-medium text-[var(--text-primary)]">
                      {row.name}
                    </p>
                    <p className="mt-1 text-lg font-bold text-[var(--text-primary)] sm:text-xl">
                      {row.stockQty}
                      <span className="ml-1 text-xs font-medium text-[var(--text-muted)]">
                        un.
                      </span>
                    </p>
                    <div className="mt-1 flex items-center justify-between text-[11px]">
                      <span
                        className={`rounded-full border px-2 py-0.5 ${rowBadge.className}`}
                      >
                        {rowBadge.label}
                      </span>
                      <span className="text-[var(--text-secondary)]">{money(row.lastKnownPrice)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {(items?.meta.totalPages ?? 1) > 1 ? (
          <div className="mt-3 flex shrink-0 items-center justify-between text-xs text-[var(--text-secondary)]">
            <span>
              Página {items?.meta.page} de {items?.meta.totalPages} · {items?.meta.total}{' '}
              item(ns)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-[var(--border-color)] px-2 py-1 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={page >= (items?.meta.totalPages ?? 1)}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-[var(--border-color)] px-2 py-1 disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-2 shrink-0 text-xs text-[var(--text-muted)]">
            {items?.data.length ?? 0} item(ns) externos
          </p>
        )}
      </GlassCard>

      <GlassCard className="lista-container flex h-full min-h-0 flex-col overflow-hidden p-3 sm:p-4">
        {!selected ? (
          <p className="text-sm text-[var(--text-secondary)]">
            Selecione um item para ver saldo, pedidos e movimentações.
          </p>
        ) : (
          <div className="erp-scrollbar min-h-0 flex-1 overflow-y-auto">
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#1e2130]">
                  <Package className="h-7 w-7 text-[#5b5ef4]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-[var(--text-primary)]">
                    {selected.name}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Origem: {selected.source} · {money(selected.lastKnownPrice)}
                  </p>
                </div>
              </div>
            </div>
            {badge ? (
              <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                <span
                  className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${badge.className}`}
                >
                  {badge.label}
                </span>
              </div>
            ) : null}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
                <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                  <Package className="h-4 w-4 text-[#64748b]" />
                  Qtd real
                </p>
                <p className="mt-3 text-lg font-bold text-[var(--text-primary)] sm:text-2xl">
                  {selected.stockQty}
                </p>
                <p className="text-xs text-[var(--text-muted)]">em estoque físico</p>
              </div>
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
                <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                  <PackagePlus className="h-4 w-4 text-[#22c55e]" />
                  Entradas
                </p>
                <p className="mt-3 text-lg font-bold text-[var(--text-primary)] sm:text-2xl">
                  {movementStats.inbound}
                </p>
                <p className="text-xs text-[var(--text-muted)]">histórico</p>
              </div>
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
                <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                  <PackageMinus className="h-4 w-4 text-[#ef4444]" />
                  Saídas
                </p>
                <p className="mt-3 text-lg font-bold text-[var(--text-primary)] sm:text-2xl">
                  {movementStats.outbound}
                </p>
                <p className="text-xs text-[var(--text-muted)]">histórico</p>
              </div>
            </div>

            {canCreate ? (
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[8rem_1fr_auto]">
                <input
                  value={entradaQty}
                  onChange={(e) => setEntradaQty(e.target.value)}
                  placeholder="Qtd entrada"
                  inputMode="numeric"
                  className="h-10 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 text-sm text-[var(--text-primary)] outline-none"
                />
                <input
                  value={entradaNotes}
                  onChange={(e) => setEntradaNotes(e.target.value)}
                  placeholder="Observação (opcional)"
                  className="h-10 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 text-sm text-[var(--text-primary)] outline-none"
                />
                <GlowButton
                  disabled={savingEntrada}
                  onClick={() => void handleEntrada()}
                >
                  {savingEntrada ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PackagePlus className="h-4 w-4" />
                  )}
                  Registrar entrada
                </GlowButton>
              </div>
            ) : null}

            {detailLoading ? (
              <p className="mt-4 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando detalhes...
              </p>
            ) : (
              <>
                <div className="mt-4">
                  <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
                    Pedidos que usaram este item
                  </p>
                  <div className="erp-scrollbar overflow-x-auto rounded-xl border border-[var(--border-color)]">
                    {!orders.length ? (
                      <p className="px-3 py-4 text-sm text-[var(--text-muted)]">
                        Nenhum pedido vinculado a este item.
                      </p>
                    ) : (
                      <table className="w-full min-w-[420px] border-collapse text-left text-sm">
                        <thead className="bg-[var(--input-bg)] text-xs text-[var(--text-secondary)]">
                          <tr>
                            <th className="px-2 py-1.5">Pedido</th>
                            <th className="px-2 py-1.5 text-center">Qtd</th>
                            <th className="px-2 py-1.5">Cliente</th>
                            <th className="px-2 py-1.5">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orders.map((row, idx) => (
                            <tr
                              key={row.itemId}
                              className={`cursor-pointer border-b border-[var(--border-color)] transition hover:bg-[var(--accent)]/10 ${
                                idx % 2 === 0
                                  ? 'bg-[var(--bg-card)]'
                                  : 'bg-[var(--input-bg)]'
                              }`}
                              onClick={() =>
                                router.push(
                                  `/app/expedicao/pedidos?search=${encodeURIComponent(row.orderNumber)}`,
                                )
                              }
                            >
                              <td className="px-2 py-1.5 font-medium text-[var(--accent)] underline-offset-2 hover:underline">
                                {row.orderNumber}
                              </td>
                              <td className="px-2 py-1.5 text-center font-semibold tabular-nums">
                                {row.quantity}
                              </td>
                              <td className="px-2 py-1.5 text-[var(--text-secondary)]">
                                {row.customerName}
                              </td>
                              <td className="px-2 py-1.5 text-xs text-[var(--text-secondary)]">
                                {row.status}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
                    Tabela de Movimentações Recentes
                  </p>
                  <div className="erp-scrollbar overflow-x-auto rounded-xl border border-[var(--border-color)]">
                    {!movements.length ? (
                      <p className="px-3 py-4 text-sm text-[var(--text-muted)]">
                        Sem movimentações ainda.
                      </p>
                    ) : (
                      <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                        <thead className="bg-[var(--input-bg)] text-xs text-[var(--text-secondary)]">
                          <tr>
                            <th className="px-2 py-1">Data/Hora</th>
                            <th className="px-2 py-1">Tipo de Movimento</th>
                            <th className="px-2 py-1">Quantidade</th>
                            <th className="px-2 py-1">Referência</th>
                            <th className="px-2 py-1">Responsável</th>
                          </tr>
                        </thead>
                        <tbody>
                          {movements.map((row, idx) => (
                            <tr
                              key={row.id}
                              className={`border-b border-[var(--border-color)] ${
                                idx % 2 === 0
                                  ? 'bg-[var(--bg-card)]'
                                  : 'bg-[var(--input-bg)]'
                              }`}
                            >
                              <td className="px-2 py-1 text-[var(--text-primary)]">
                                {formatDateTime(row.movementDate)}
                              </td>
                              <td className="px-2 py-1">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-xs ${
                                    row.movementType === 'INBOUND'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-rose-100 text-rose-800'
                                  }`}
                                >
                                  {row.movementType === 'INBOUND' ? 'Entrada' : 'Saída'}
                                </span>
                              </td>
                              <td className="px-2 py-1 text-[var(--text-primary)]">
                                {row.quantity}
                              </td>
                              <td className="px-2 py-1 text-[var(--text-primary)]">
                                {row.reference || row.notes || '—'}
                              </td>
                              <td className="px-2 py-1 text-[var(--text-primary)]">
                                {row.movedBy?.name ?? '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
