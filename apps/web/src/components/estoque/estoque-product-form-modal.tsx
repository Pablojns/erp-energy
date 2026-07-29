'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  CategorySelect,
  type CategorySelectDto,
} from '@/src/components/estoque/category-select';
import { GlowButton } from '@/src/components/shell/glow-button';
import { GlassCard } from '@/src/components/shell/glass-card';

export type ProductFormState = {
  sku: string;
  name: string;
  categoryId: string;
  price: string;
  cost: string;
  minStock: string;
  supplierId: string;
  supplierSku: string;
};

export const emptyProductForm: ProductFormState = {
  sku: '',
  name: '',
  categoryId: '',
  price: '',
  cost: '',
  minStock: '0',
  supplierId: '',
  supplierSku: '',
};

type SupplierOption = {
  id: string;
  name: string;
  isActive: boolean;
};

export function EstoqueProductFormModal(props: {
  open: boolean;
  mode: 'create' | 'edit';
  initialForm: ProductFormState;
  suppliers: SupplierOption[];
  categories: CategorySelectDto[];
  saving: boolean;
  onClose: () => void;
  onSave: (form: ProductFormState) => void;
  onRefreshCategories: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const {
    open,
    mode,
    initialForm,
    suppliers,
    categories,
    saving,
    onClose,
    onSave,
    onRefreshCategories,
    onError,
  } = props;

  const [form, setForm] = useState<ProductFormState>(initialForm);

  useEffect(() => {
    if (open) {
      setForm(initialForm);
    }
  }, [open, initialForm]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
    >
      <div
        className="h-[100dvh] w-screen max-w-none sm:h-auto sm:w-full sm:max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <GlassCard className="h-[100dvh] w-screen max-w-none overflow-y-auto rounded-none p-3 shadow-2xl sm:max-h-[90vh] sm:h-auto sm:w-full sm:max-w-lg sm:rounded-2xl sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {mode === 'create' ? 'Novo produto' : 'Editar produto'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Fechar
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            SKU é o identificador principal. Campos com * são obrigatórios.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs text-gray-500 sm:col-span-2">
              Nome *
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-base text-[var(--text-primary)] outline-none"
              />
            </label>
            <label className="block text-xs text-gray-500 sm:col-span-1">
              SKU *
              <input
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-base text-[var(--text-primary)] outline-none"
              />
            </label>
            <label className="block text-xs text-gray-500 sm:col-span-1">
              SKU do fornecedor
              <input
                value={form.supplierSku}
                onChange={(e) =>
                  setForm((f) => ({ ...f, supplierSku: e.target.value }))
                }
                placeholder="Código no catálogo do fornecedor"
                className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-base text-[var(--text-primary)] outline-none"
              />
            </label>
            <label className="block text-xs text-gray-500 sm:col-span-2">
              Fornecedor
              <select
                value={form.supplierId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, supplierId: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-base text-[var(--text-primary)] outline-none"
              >
                <option value="">Selecione...</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <CategorySelect
                categories={categories}
                value={form.categoryId}
                onChange={(categoryId) => setForm((f) => ({ ...f, categoryId }))}
                onRefreshCategories={onRefreshCategories}
                onError={onError}
                disabled={saving}
              />
            </div>
            <label className="block text-xs text-gray-500 sm:col-span-1">
              Preço (R$) *
              <input
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-base text-[var(--text-primary)] outline-none"
              />
            </label>
            <label className="block text-xs text-gray-500 sm:col-span-1">
              Custo (R$)
              <input
                value={form.cost}
                onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-base text-[var(--text-primary)] outline-none"
              />
            </label>
            <label className="block text-xs text-gray-500 sm:col-span-2">
              Estoque mínimo *
              <input
                value={form.minStock}
                onChange={(e) =>
                  setForm((f) => ({ ...f, minStock: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-base text-[var(--text-primary)] outline-none"
              />
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <GlowButton variant="secondary" onClick={onClose}>
              Cancelar
            </GlowButton>
            <GlowButton variant="primary" disabled={saving} onClick={() => onSave(form)}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando
                </>
              ) : (
                'Salvar'
              )}
            </GlowButton>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
