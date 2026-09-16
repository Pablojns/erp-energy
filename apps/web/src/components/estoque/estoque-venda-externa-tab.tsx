'use client';

import { Loader2, PackagePlus, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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

function money(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function EstoqueVendaExternaTab() {
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
  const [movementsLoading, setMovementsLoading] = useState(false);

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
      return;
    }
    let cancelled = false;
    setMovementsLoading(true);
    void erpFetchJson<MovementRow[]>(`api/estoque/venda-externa/${selectedId}/movements`)
      .then((rows) => {
        if (!cancelled) setMovements(rows);
      })
      .catch(() => {
        if (!cancelled) setMovements([]);
      })
      .finally(() => {
        if (!cancelled) setMovementsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selected = items?.data.find((row) => row.id === selectedId) ?? null;

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

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[42fr_58fr]">
      <GlassCard className="flex h-full min-h-0 flex-col overflow-hidden border-[var(--border-color)] bg-[var(--bg-card)] p-3 sm:p-4">
        <div className="mb-3 shrink-0 space-y-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] sm:text-xl">
              Estoque Venda Externa
            </h3>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Itens externos com saldo próprio — nunca mistura com o estoque WEG.
            </p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar item externo"
              className="h-10 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
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
        <div className="erp-scrollbar min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--border-color)]">
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
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-[var(--input-bg)] text-xs text-[var(--text-secondary)]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Item</th>
                  <th className="px-3 py-2 font-semibold">Origem</th>
                  <th className="px-3 py-2 font-semibold text-right">Estoque</th>
                  <th className="px-3 py-2 font-semibold text-right">Preço</th>
                </tr>
              </thead>
              <tbody>
                {items.data.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    className={`cursor-pointer border-t border-[var(--border-color)] ${
                      row.id === selectedId
                        ? 'bg-[var(--accent)]/10'
                        : 'hover:bg-[var(--input-bg)]'
                    }`}
                  >
                    <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                      {row.name}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{row.source}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-primary)]">
                      {row.stockQty}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">
                      {money(row.lastKnownPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
        ) : null}
      </GlassCard>

      <GlassCard className="flex h-full min-h-0 flex-col overflow-hidden border-[var(--border-color)] bg-[var(--bg-card)] p-3 sm:p-4">
        {!selected ? (
          <p className="text-sm text-[var(--text-secondary)]">
            Selecione um item para ver o saldo e registrar entrada.
          </p>
        ) : (
          <>
            <div className="shrink-0">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                {selected.name}
              </h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Saldo atual: <strong className="text-[var(--text-primary)]">{selected.stockQty}</strong>{' '}
                un. · {selected.source}
              </p>
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
            </div>
            <div className="erp-scrollbar mt-4 min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--border-color)]">
              {movementsLoading ? (
                <p className="flex items-center gap-2 p-4 text-sm text-[var(--text-secondary)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando movimentações...
                </p>
              ) : !movements.length ? (
                <p className="p-4 text-sm text-[var(--text-secondary)]">
                  Sem movimentações ainda.
                </p>
              ) : (
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="sticky top-0 bg-[var(--input-bg)] text-xs text-[var(--text-secondary)]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Data</th>
                      <th className="px-3 py-2 font-semibold">Tipo</th>
                      <th className="px-3 py-2 font-semibold text-right">Qtd</th>
                      <th className="px-3 py-2 font-semibold">Referência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((row) => (
                      <tr key={row.id} className="border-t border-[var(--border-color)]">
                        <td className="px-3 py-2 text-[var(--text-secondary)]">
                          {new Date(row.movementDate).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-3 py-2">
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
                        <td className="px-3 py-2 text-right tabular-nums">{row.quantity}</td>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">
                          {row.reference || row.notes || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </GlassCard>
    </div>
  );
}
