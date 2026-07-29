'use client';

import { useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  CategorySelect,
  type CategorySelectDto,
} from '@/src/components/estoque/category-select';
import { GlowButton } from '@/src/components/shell/glow-button';
import { GlassCard } from '@/src/components/shell/glass-card';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

export type BulkEditProduct = {
  id: string;
  sku: string;
  name: string;
};

type SupplierOption = {
  id: string;
  name: string;
  isActive: boolean;
};

type FieldKey =
  | 'categoryId'
  | 'price'
  | 'cost'
  | 'minStock'
  | 'supplierId'
  | 'supplierSku';

const FIELD_META: Array<{ key: FieldKey; label: string }> = [
  { key: 'categoryId', label: 'Categoria' },
  { key: 'price', label: 'Preço (R$)' },
  { key: 'cost', label: 'Custo (R$)' },
  { key: 'minStock', label: 'Estoque mínimo' },
  { key: 'supplierId', label: 'Fornecedor' },
  { key: 'supplierSku', label: 'SKU do fornecedor' },
];

function parseMoney(raw: string): number | null {
  const n = Number(String(raw).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Number(n.toFixed(2));
}

export function EstoqueBulkEditModal(props: {
  open: boolean;
  products: BulkEditProduct[];
  categories: CategorySelectDto[];
  suppliers: SupplierOption[];
  onClose: () => void;
  onRefreshCategories: () => Promise<void>;
  onError: (message: string | null) => void;
  onSuccess: (message: string) => void;
  onDone: () => void | Promise<void>;
}) {
  const {
    open,
    products,
    categories,
    suppliers,
    onClose,
    onRefreshCategories,
    onError,
    onSuccess,
    onDone,
  } = props;

  const [enabled, setEnabled] = useState<Record<FieldKey, boolean>>({
    categoryId: false,
    price: false,
    cost: false,
    minStock: false,
    supplierId: false,
    supplierSku: false,
  });
  const [expanded, setExpanded] = useState<FieldKey | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [minStock, setMinStock] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierSku, setSupplierSku] = useState('');
  const [saving, setSaving] = useState(false);

  const enabledCount = useMemo(
    () => FIELD_META.filter((f) => enabled[f.key]).length,
    [enabled],
  );

  if (!open) return null;

  const toggleField = (key: FieldKey) => {
    setEnabled((prev) => {
      const next = !prev[key];
      if (next) setExpanded(key);
      else if (expanded === key) setExpanded(null);
      return { ...prev, [key]: next };
    });
  };

  const buildPayload = (): Record<string, string | number | null> | null => {
    const payload: Record<string, string | number | null> = {};

    if (enabled.categoryId) {
      payload.categoryId = categoryId.trim() || null;
    }
    if (enabled.price) {
      const n = parseMoney(price);
      if (n === null) {
        onError('Informe um preço válido (número ≥ 0).');
        return null;
      }
      payload.price = n;
    }
    if (enabled.cost) {
      const raw = cost.trim();
      if (raw.length === 0) {
        onError('Informe um custo válido ou desmarque o campo Custo.');
        return null;
      }
      const n = parseMoney(raw);
      if (n === null) {
        onError('Informe um custo válido (número ≥ 0).');
        return null;
      }
      payload.cost = n;
    }
    if (enabled.minStock) {
      const parsed = Number.parseInt(minStock.trim(), 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        onError('Informe um estoque mínimo válido (inteiro ≥ 0).');
        return null;
      }
      payload.minStock = parsed;
    }
    if (enabled.supplierId) {
      payload.supplierId = supplierId.trim() || null;
    }
    if (enabled.supplierSku) {
      payload.supplierSku = supplierSku.trim() || null;
    }

    if (Object.keys(payload).length === 0) {
      onError('Ative ao menos um campo para editar em massa.');
      return null;
    }
    return payload;
  };

  const handleSave = async () => {
    if (saving || products.length === 0) return;
    const payload = buildPayload();
    if (!payload) return;

    setSaving(true);
    let ok = 0;
    const errors: string[] = [];
    for (const product of products) {
      try {
        await erpFetchJson(`products/${product.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        ok += 1;
      } catch (err) {
        errors.push(
          `${product.sku}: ${
            err instanceof Error ? err.message : 'falha ao atualizar'
          }`,
        );
      }
    }
    setSaving(false);

    if (ok > 0) {
      onSuccess(
        `${ok} produto${ok === 1 ? '' : 's'} atualizado${ok === 1 ? '' : 's'} em massa.`,
      );
      await onDone();
      onClose();
    }
    if (errors.length > 0) {
      onError(
        `Falhas (${errors.length}): ${errors.slice(0, 3).join(' · ')}${
          errors.length > 3 ? '…' : ''
        }`,
      );
    }
  };

  const fieldValuePreview = (key: FieldKey): string => {
    switch (key) {
      case 'categoryId':
        return (
          categories.find((c) => c.id === categoryId)?.name ||
          (categoryId ? 'Selecionada' : 'Limpar categoria')
        );
      case 'price':
        return price.trim() || '—';
      case 'cost':
        return cost.trim() || '—';
      case 'minStock':
        return minStock.trim() || '—';
      case 'supplierId':
        return (
          suppliers.find((s) => s.id === supplierId)?.name ||
          (supplierId ? 'Selecionado' : 'Limpar fornecedor')
        );
      case 'supplierSku':
        return supplierSku.trim() || '—';
    }
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
    >
      <div
        className="h-[100dvh] w-screen max-w-none sm:h-auto sm:w-full sm:max-w-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <GlassCard className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden rounded-none p-3 shadow-2xl sm:max-h-[90vh] sm:h-auto sm:rounded-2xl sm:p-5">
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Editar em Massa
              </h2>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {products.length} produto{products.length === 1 ? '' : 's'}{' '}
                selecionado{products.length === 1 ? '' : 's'}. Ative os campos
                que deseja aplicar a todos.
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--input-bg)] hover:text-[var(--text-primary)]"
              aria-label="Fechar"
              onClick={onClose}
              disabled={saving}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="erp-scrollbar mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {FIELD_META.map((field) => {
              const isOn = enabled[field.key];
              const isOpen = expanded === field.key;
              return (
                <div
                  key={field.key}
                  className={`rounded-xl border ${
                    isOn
                      ? 'border-[var(--accent)]/50 bg-[var(--accent)]/5'
                      : 'border-[var(--border-color)] bg-[var(--bg-card)]'
                  }`}
                >
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm text-[var(--text-primary)]">
                      <input
                        type="checkbox"
                        checked={isOn}
                        onChange={() => toggleField(field.key)}
                        disabled={saving}
                      />
                      <span className="font-medium">{field.label}</span>
                      {isOn ? (
                        <span className="truncate text-xs text-[var(--text-secondary)]">
                          → {fieldValuePreview(field.key)}
                        </span>
                      ) : null}
                    </label>
                    {isOn ? (
                      <button
                        type="button"
                        className="shrink-0 rounded-lg border border-[var(--border-color)] px-2 py-1 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        onClick={() =>
                          setExpanded((cur) =>
                            cur === field.key ? null : field.key,
                          )
                        }
                        disabled={saving}
                      >
                        {isOpen ? 'Fechar' : 'Editar'}
                      </button>
                    ) : null}
                  </div>

                  {isOn && isOpen ? (
                    <div className="border-t border-[var(--border-color)] px-3 py-3">
                      {field.key === 'categoryId' ? (
                        <CategorySelect
                          categories={categories}
                          value={categoryId}
                          onChange={setCategoryId}
                          onRefreshCategories={onRefreshCategories}
                          onError={onError}
                          disabled={saving}
                        />
                      ) : null}
                      {field.key === 'price' ? (
                        <input
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          placeholder="Ex.: 19,90"
                          disabled={saving}
                          className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                        />
                      ) : null}
                      {field.key === 'cost' ? (
                        <input
                          value={cost}
                          onChange={(e) => setCost(e.target.value)}
                          placeholder="Ex.: 10,00"
                          disabled={saving}
                          className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                        />
                      ) : null}
                      {field.key === 'minStock' ? (
                        <input
                          value={minStock}
                          onChange={(e) => setMinStock(e.target.value)}
                          placeholder="Ex.: 5"
                          disabled={saving}
                          className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                        />
                      ) : null}
                      {field.key === 'supplierId' ? (
                        <select
                          value={supplierId}
                          onChange={(e) => setSupplierId(e.target.value)}
                          disabled={saving}
                          className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                        >
                          <option value="">Sem fornecedor</option>
                          {suppliers.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      {field.key === 'supplierSku' ? (
                        <input
                          value={supplierSku}
                          onChange={(e) => setSupplierSku(e.target.value)}
                          placeholder="Código no fornecedor"
                          disabled={saving}
                          className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--border-color)] pt-3">
            <span className="text-xs text-[var(--text-secondary)]">
              {enabledCount} campo{enabledCount === 1 ? '' : 's'} ativo
              {enabledCount === 1 ? '' : 's'}
            </span>
            <div className="flex gap-2">
              <GlowButton
                variant="secondary"
                disabled={saving}
                onClick={onClose}
              >
                Cancelar
              </GlowButton>
              <GlowButton
                variant="primary"
                disabled={saving || enabledCount === 0 || products.length === 0}
                onClick={() => void handleSave()}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Aplicando…
                  </>
                ) : (
                  'Aplicar a todos'
                )}
              </GlowButton>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
