'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { CrmOrcamentoCatalogPickerModal } from '@/src/components/crm/orcamentos/crm-orcamento-catalog-picker';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import { generateUUID } from '@/src/lib/uuid';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { numeroPedFromOrder, normalizePedidoFromApi, pedidoApiUrl } from '@/src/services/api/pedidos-normalize';
import type { QuoteCatalogProductDto } from '@/src/services/api/quotes-api';

type InventoryProduct = {
  id: string;
  sku: string;
  name: string;
  price?: string;
};

type PaginatedProducts = {
  data: InventoryProduct[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

type DraftItem = {
  key: string;
  productId: string;
  sku: string;
  name: string;
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

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function draftFromOrder(order: OrderDto): DraftItem[] {
  return order.items.map((it) => ({
    key: it.id,
    productId: it.productId ?? '',
    sku: it.sku ?? '',
    name: it.description ?? '',
    quantity: String(it.quantity ?? 1),
    unitPrice: it.unitPrice ?? '0',
  }));
}

async function resolveInventoryProductBySku(
  sku: string,
): Promise<InventoryProduct | null> {
  const needle = sku.trim().toLowerCase();
  if (!needle) return null;
  const res = await erpFetchJson<PaginatedProducts>(
    `products?search=${encodeURIComponent(sku.trim())}&pageSize=50&status=active`,
  );
  const rows = res.data ?? [];
  return (
    rows.find((p) => p.sku.trim().toLowerCase() === needle) ??
    rows.find((p) => p.sku.trim().toLowerCase().includes(needle)) ??
    null
  );
}

export function SiteOrderItemsEditor(props: {
  order: OrderDto;
  onSaved?: () => void | Promise<void>;
}) {
  const { order, onSaved } = props;
  const [draft, setDraft] = useState<DraftItem[]>(() => draftFromOrder(order));
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickingKey, setPickingKey] = useState<string | null>(null);

  const itemsFingerprint = order.items
    .map((it) => `${it.id}:${it.productId ?? ''}:${it.sku}:${it.quantity}:${it.unitPrice ?? ''}`)
    .join('|');

  useEffect(() => {
    setDraft(draftFromOrder(order));
    setError(null);
    setPickerOpen(false);
    setPickingKey(null);
    // Sincroniza quando os itens do pedido mudam de fato (após refetch).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional fingerprint
  }, [order.id, itemsFingerprint]);

  const estimatedTotal = draft.reduce((acc, row) => {
    const qty = Number(row.quantity);
    const price = Number(String(row.unitPrice).replace(',', '.'));
    if (!Number.isFinite(qty) || !Number.isFinite(price)) return acc;
    return acc + qty * price;
  }, 0);

  const updateRow = (key: string, patch: Partial<DraftItem>) => {
    setDraft((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const openPickerFor = (key: string) => {
    setPickingKey(key);
    setPickerOpen(true);
    setError(null);
  };

  const handleCatalogSelect = async (catalogProduct: QuoteCatalogProductDto) => {
    if (!pickingKey) return;
    setResolving(true);
    setError(null);
    try {
      const inventory = await resolveInventoryProductBySku(catalogProduct.supplierCode);
      if (!inventory) {
        setError(
          `SKU "${catalogProduct.supplierCode}" não encontrado no estoque. Cadastre o produto antes de usá-lo no pedido.`,
        );
        return;
      }
      const catalogPrice = Number(catalogProduct.salePrice);
      updateRow(pickingKey, {
        productId: inventory.id,
        sku: inventory.sku,
        name: inventory.name || catalogProduct.name,
        unitPrice: Number.isFinite(catalogPrice)
          ? String(catalogPrice)
          : inventory.price ?? '0',
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Falha ao vincular produto do catálogo.',
      );
    } finally {
      setResolving(false);
      setPickingKey(null);
    }
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
      const saved = await erpFetchJson<Record<string, unknown>>(
        pedidoApiUrl(numeroPed, 'site-items'),
        {
          method: 'PATCH',
          body: JSON.stringify({ items }),
        },
      );
      if (saved && typeof saved === 'object') {
        const normalized = normalizePedidoFromApi(saved);
        if (normalized.items?.length) {
          setDraft(draftFromOrder(normalized));
        }
      }
      await onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar itens.');
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || resolving;

  return (
    <div className="exp-wb-table-wrap">
      <div className="exp-wb-table-head exp-wb-table-head--compact flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[var(--text-primary)]">
          Itens do pedido (editáveis)
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const key = generateUUID();
            setDraft((prev) => [
              ...prev,
              {
                key,
                productId: '',
                sku: '',
                name: '',
                quantity: '1',
                unitPrice: '0',
              },
            ]);
            openPickerFor(key);
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--input-bg)] disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar item
        </button>
      </div>

      <div className="space-y-2 p-2">
        {draft.map((row, index) => {
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
              <div className="min-w-0">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => openPickerFor(row.key)}
                  className={`${fieldClass(!row.productId)} flex items-start gap-2 text-left`}
                >
                  <Search className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                  <span className="min-w-0 flex-1">
                    {row.productId ? (
                      <>
                        <span className="block truncate font-medium text-[var(--text-primary)]">
                          {row.name || 'Produto'}
                        </span>
                        <span className="block truncate font-mono text-[10px] text-[var(--text-muted)]">
                          {row.sku}
                        </span>
                      </>
                    ) : (
                      <span className="text-[var(--text-muted)]">
                        Buscar produto no catálogo…
                      </span>
                    )}
                  </span>
                </button>
              </div>
              <div>
                <input
                  type="number"
                  min={1}
                  step={1}
                  disabled={busy}
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
                  disabled={busy}
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
                  disabled={busy || draft.length <= 1}
                  title="Remover item"
                  className="rounded-lg border border-[var(--border-color)] p-1.5 text-[var(--text-secondary)] transition hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-40"
                  onClick={() => {
                    setDraft((prev) => prev.filter((r) => r.key !== row.key));
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
          disabled={busy}
          onClick={() => void handleSave()}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Salvar itens
        </button>
      </div>
      {error ? <p className="px-3 pb-2 text-xs text-rose-500">{error}</p> : null}
      {resolving ? (
        <p className="px-3 pb-2 text-xs text-[var(--text-muted)]">
          Vinculando produto do catálogo ao estoque…
        </p>
      ) : null}

      <CrmOrcamentoCatalogPickerModal
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          setPickingKey(null);
        }}
        onSelect={(product) => void handleCatalogSelect(product)}
      />
    </div>
  );
}
