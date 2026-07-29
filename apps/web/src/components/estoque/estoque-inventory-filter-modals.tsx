'use client';

import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { GlassCard } from '@/src/components/shell/glass-card';

type SupplierOption = {
  id: string;
  name: string;
  isActive: boolean;
};

type CategoryOption = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  active: boolean;
};

export function EstoqueInventoryFilterModals(props: {
  supplierModalOpen: boolean;
  categoryModalOpen: boolean;
  suppliers: SupplierOption[];
  categories: CategoryOption[];
  selectedSupplierId: string;
  selectedCategoryId: string;
  onSelectSupplier: (id: string) => void;
  onSelectCategory: (id: string) => void;
  onClearSupplier: () => void;
  onClearCategory: () => void;
  onCloseSupplier: () => void;
  onCloseCategory: () => void;
}) {
  const {
    supplierModalOpen,
    categoryModalOpen,
    suppliers,
    categories,
    selectedSupplierId,
    selectedCategoryId,
    onSelectSupplier,
    onSelectCategory,
    onClearSupplier,
    onClearCategory,
    onCloseSupplier,
    onCloseCategory,
  } = props;

  const [supplierFilterSearch, setSupplierFilterSearch] = useState('');
  const [categoryFilterSearch, setCategoryFilterSearch] = useState('');

  useEffect(() => {
    if (supplierModalOpen) {
      setSupplierFilterSearch('');
    }
  }, [supplierModalOpen]);

  useEffect(() => {
    if (categoryModalOpen) {
      setCategoryFilterSearch('');
    }
  }, [categoryModalOpen]);

  const filteredSupplierOptions = useMemo(() => {
    const q = supplierFilterSearch.trim().toLowerCase();
    const sorted = [...suppliers].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR'),
    );
    if (!q) return sorted;
    return sorted.filter((s) => s.name.toLowerCase().includes(q));
  }, [suppliers, supplierFilterSearch]);

  const filteredCategoryOptions = useMemo(() => {
    const q = categoryFilterSearch.trim().toLowerCase();
    const sorted = [...categories]
      .filter((c) => c.active)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    if (!q) return sorted;
    return sorted.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, categoryFilterSearch]);

  return (
    <>
      {supplierModalOpen ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
        >
          <div
            className="h-auto w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <GlassCard className="border-gray-200 p-3 shadow-2xl sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  Filtrar por fornecedor
                </h2>
                <button
                  type="button"
                  className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--input-bg)] hover:text-[var(--text-primary)]"
                  aria-label="Fechar"
                  onClick={onCloseSupplier}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  autoFocus
                  value={supplierFilterSearch}
                  onChange={(e) => setSupplierFilterSearch(e.target.value)}
                  placeholder="Buscar fornecedor..."
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] py-2.5 pl-10 pr-3 text-sm text-[var(--text-primary)] outline-none"
                />
              </div>
              <div className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() => {
                    onClearSupplier();
                    onCloseSupplier();
                  }}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    !selectedSupplierId
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]'
                      : 'border-[var(--border-color)] hover:bg-[var(--input-bg)]'
                  }`}
                >
                  Todos os fornecedores
                </button>
                {filteredSupplierOptions.map((supplier) => {
                  const active = selectedSupplierId === supplier.id;
                  return (
                    <button
                      key={supplier.id}
                      type="button"
                      onClick={() => {
                        onSelectSupplier(supplier.id);
                        onCloseSupplier();
                      }}
                      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]'
                          : 'border-[var(--border-color)] hover:bg-[var(--input-bg)]'
                      }`}
                    >
                      <span className="truncate font-medium">{supplier.name}</span>
                      {active ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                          ativo
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                {filteredSupplierOptions.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-[var(--text-muted)]">
                    Nenhum fornecedor encontrado.
                  </p>
                ) : null}
              </div>
            </GlassCard>
          </div>
        </div>
      ) : null}

      {categoryModalOpen ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
        >
          <div
            className="h-auto w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <GlassCard className="border-gray-200 p-3 shadow-2xl sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  Filtrar por categoria
                </h2>
                <button
                  type="button"
                  className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--input-bg)] hover:text-[var(--text-primary)]"
                  aria-label="Fechar"
                  onClick={onCloseCategory}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  autoFocus
                  value={categoryFilterSearch}
                  onChange={(e) => setCategoryFilterSearch(e.target.value)}
                  placeholder="Buscar categoria..."
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] py-2.5 pl-10 pr-3 text-sm text-[var(--text-primary)] outline-none"
                />
              </div>
              <div className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() => {
                    onClearCategory();
                    onCloseCategory();
                  }}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    !selectedCategoryId
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]'
                      : 'border-[var(--border-color)] hover:bg-[var(--input-bg)]'
                  }`}
                >
                  Todas as categorias
                </button>
                {filteredCategoryOptions.map((category) => {
                  const active = selectedCategoryId === category.id;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => {
                        onSelectCategory(category.id);
                        onCloseCategory();
                      }}
                      className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]'
                          : 'border-[var(--border-color)] hover:bg-[var(--input-bg)]'
                      }`}
                      style={
                        category.color && !active
                          ? { borderColor: `${category.color}44` }
                          : undefined
                      }
                    >
                      {category.color ? (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/25"
                          style={{ backgroundColor: category.color }}
                          aria-hidden
                        />
                      ) : (
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gray-500" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {category.name}
                      </span>
                      {active ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                          ativo
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                {filteredCategoryOptions.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-[var(--text-muted)]">
                    Nenhuma categoria encontrada.
                  </p>
                ) : null}
              </div>
            </GlassCard>
          </div>
        </div>
      ) : null}
    </>
  );
}
