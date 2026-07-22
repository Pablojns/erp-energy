'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { generateUUID } from '@/src/lib/uuid';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { numeroPedFromOrder } from '@/src/services/api/pedidos-normalize';

type ProductOption = {
  id: string;
  sku: string;
  name: string;
  price?: string;
};

type PaginatedProducts = {
  data: ProductOption[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

type DraftItem = {
  key: string;
  productId: string;
  quantity: string;
  unitPrice: string;
};

function fieldClass(invalid?: boolean) {
  return `w-full rounded-lg border px-2.5 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)] ${
    invalid
      ? 'border-rose-500/70 bg-rose-500/[0.06]'
      : 'border-[var(--border-color)] bg-[var(--input-bg)]'
  }`;
}

function productMatchesSearch(product: ProductOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    product.sku.toLowerCase().includes(q) ||
    product.name.toLowerCase().includes(q)
  );
}

function sortProductsForSearch(
  products: ProductOption[],
  query: string,
): ProductOption[] {
  const filtered = products.filter((p) => productMatchesSearch(p, query));
  const q = query.trim().toLowerCase();
  if (!q) return filtered.slice(0, 40);
  return filtered
    .sort((a, b) => {
      const aSku = a.sku.toLowerCase().startsWith(q) ? 0 : 1;
      const bSku = b.sku.toLowerCase().startsWith(q) ? 0 : 1;
      if (aSku !== bSku) return aSku - bSku;
      return a.sku.localeCompare(b.sku, 'pt-BR');
    })
    .slice(0, 40);
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

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function draftFromOrder(order: OrderDto): DraftItem[] {
  return order.items.map((it) => ({
    key: it.id,
    productId: it.productId ?? '',
    quantity: String(it.quantity ?? 1),
    unitPrice: it.unitPrice ?? '0',
  }));
}

export function SiteOrderItemsEditor(props: {
  order: OrderDto;
  onSaved?: () => void;
}) {
  const { order, onSaved } = props;
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [draft, setDraft] = useState<DraftItem[]>(() => draftFromOrder(order));
  const [productSearch, setProductSearch] = useState<Record<string, string>>({});
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(draftFromOrder(order));
    setProductSearch({});
    setOpenDropdown(null);
    setError(null);
    // Reset só quando o pedido recarrega (id/updatedAt), não a cada re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [order.id, order.updatedAt]);

  useEffect(() => {
    if (products.length === 0) return;
    setProductSearch((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const row of draft) {
        if (!row.productId || next[row.key]) continue;
        const p = products.find((x) => x.id === row.productId);
        if (p) {
          next[row.key] = p.name;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [products, draft]);

  useEffect(() => {
    let cancelled = false;
    setLoadingProducts(true);
    void loadActiveProducts()
      .then((rows) => {
        if (!cancelled) setProducts(rows);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingProducts(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const productById = useMemo(() => {
    const map = new Map(products.map((p) => [p.id, p]));
    return (id: string) => map.get(id);
  }, [products]);

  const estimatedTotal = draft.reduce((acc, row) => {
    const qty = Number(row.quantity);
    const price = Number(String(row.unitPrice).replace(',', '.'));
    if (!Number.isFinite(qty) || !Number.isFinite(price)) return acc;
    return acc + qty * price;
  }, 0);

  const updateRow = (key: string, patch: Partial<DraftItem>) => {
    setDraft((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const handleSave = async () => {
    const numeroPed = numeroPedFromOrder(order);
    if (!numeroPed) {
      setError('Número do pedido inválido.');
      return;
    }

    const items: Array<{ productId: string; quantity: number; unitPrice: number }> = [];
    for (const row of draft) {
      if (!row.productId) {
        setError('Selecione o produto em todas as linhas.');
        return;
      }
      const qty = Number(row.quantity);
      if (!Number.isInteger(qty) || qty < 1) {
        setError('Quantidade deve ser um inteiro ≥ 1.');
        return;
      }
      const unitPrice = Number(String(row.unitPrice).replace(',', '.'));
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        setError('Preço unitário inválido.');
        return;
      }
      items.push({ productId: row.productId, quantity: qty, unitPrice });
    }

    if (items.length === 0) {
      setError('Informe ao menos um item.');
      return;
    }

    const productIds = items.map((i) => i.productId);
    if (new Set(productIds).size !== productIds.length) {
      setError('Não repita o mesmo produto em mais de um item.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await erpFetchJson(`api/pedidos/${encodeURIComponent(numeroPed)}/site-items`, {
        method: 'PATCH',
        body: JSON.stringify({ items }),
      });
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar itens.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="exp-wb-table-wrap">
      <div className="exp-wb-table-head exp-wb-table-head--compact flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[var(--text-primary)]">
          Itens do pedido (editáveis)
        </p>
        <button
          type="button"
          disabled={saving || loadingProducts}
          onClick={() => {
            const key = generateUUID();
            setDraft((prev) => [
              ...prev,
              { key, productId: '', quantity: '1', unitPrice: '0' },
            ]);
            setProductSearch((prev) => ({ ...prev, [key]: '' }));
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--input-bg)] disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar item
        </button>
      </div>

      <div className="space-y-2 p-2">
        {draft.map((row, index) => {
          const selected = productById(row.productId);
          const searchQuery = productSearch[row.key] ?? selected?.name ?? '';
          const filtered = sortProductsForSearch(products, searchQuery);
          const showDropdown = openDropdown === row.key;
          const lineTotal =
            Number(row.quantity) *
            Number(String(row.unitPrice).replace(',', '.'));

          return (
            <div
              key={row.key}
              className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)]/40 p-3 sm:grid-cols-[40px_minmax(0,1.4fr)_72px_96px_96px_36px]"
            >
              <div className="text-xs font-semibold text-[var(--text-secondary)] sm:pt-2">
                {(index + 1) * 10}
              </div>
              <div className="relative min-w-0">
                <input
                  type="search"
                  value={searchQuery}
                  disabled={saving || loadingProducts}
                  placeholder="Buscar SKU ou produto…"
                  className={fieldClass(!row.productId)}
                  onFocus={() => setOpenDropdown(row.key)}
                  onChange={(e) => {
                    const value = e.target.value;
                    setProductSearch((prev) => ({ ...prev, [row.key]: value }));
                    setOpenDropdown(row.key);
                    if (row.productId) {
                      updateRow(row.key, { productId: '' });
                    }
                  }}
                />
                {selected && !openDropdown ? (
                  <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--text-muted)]">
                    {selected.sku}
                  </p>
                ) : null}
                {showDropdown ? (
                  <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] shadow-lg">
                    {filtered.length === 0 ? (
                      <li className="px-3 py-2 text-xs text-[var(--text-muted)]">
                        Nenhum produto
                      </li>
                    ) : (
                      filtered.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            className="flex w-full flex-col items-start px-3 py-2 text-left text-xs hover:bg-[var(--input-bg)]"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              updateRow(row.key, {
                                productId: p.id,
                                unitPrice: p.price ?? row.unitPrice,
                              });
                              setProductSearch((prev) => ({
                                ...prev,
                                [row.key]: p.name,
                              }));
                              setOpenDropdown(null);
                            }}
                          >
                            <span className="font-medium text-[var(--text-primary)]">
                              {p.name}
                            </span>
                            <span className="font-mono text-[var(--text-muted)]">
                              {p.sku}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
              </div>
              <div>
                <input
                  type="number"
                  min={1}
                  step={1}
                  disabled={saving}
                  value={row.quantity}
                  className={fieldClass()}
                  aria-label="Quantidade"
                  onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                />
              </div>
              <div>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={saving}
                  value={row.unitPrice}
                  className={fieldClass()}
                  aria-label="Preço unitário"
                  onChange={(e) => updateRow(row.key, { unitPrice: e.target.value })}
                />
              </div>
              <div className="flex items-center text-xs font-semibold text-[var(--text-primary)] sm:justify-end">
                {Number.isFinite(lineTotal) ? money(lineTotal) : '—'}
              </div>
              <div className="flex items-start justify-end">
                <button
                  type="button"
                  disabled={saving || draft.length <= 1}
                  title="Remover item"
                  className="rounded-lg border border-[var(--border-color)] p-1.5 text-[var(--text-secondary)] transition hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-40"
                  onClick={() => {
                    setDraft((prev) => prev.filter((r) => r.key !== row.key));
                    setProductSearch((prev) => {
                      const next = { ...prev };
                      delete next[row.key];
                      return next;
                    });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-color)] px-3 py-2">
        <p className="text-xs text-[var(--text-secondary)]">
          Total estimado:{' '}
          <span className="font-semibold text-[var(--text-primary)]">
            {money(estimatedTotal)}
          </span>
        </p>
        <button
          type="button"
          disabled={saving || loadingProducts}
          onClick={() => void handleSave()}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Salvar itens
        </button>
      </div>
      {error ? <p className="px-3 pb-2 text-xs text-rose-500">{error}</p> : null}
    </div>
  );
}
