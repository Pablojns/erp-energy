'use client';

import { X } from 'lucide-react';
import { CrmOrcamentoCatalog } from '@/src/components/crm/orcamentos/crm-orcamento-catalog';
import type { QuoteCatalogProductDto } from '@/src/services/api/quotes-api';

export function CrmOrcamentoCatalogPickerModal(props: {
  open: boolean;
  onClose: () => void;
  onSelect: (product: QuoteCatalogProductDto) => void;
}) {
  if (!props.open) return null;

  return (
    <div className="erp-modal-overlay">
      <button
        type="button"
        className="erp-modal-backdrop"
        onClick={props.onClose}
        aria-label="Fechar"
      />
      <section className="erp-modal-panel catalog-search-modal relative flex max-h-[80vh] w-full max-w-5xl flex-col overflow-hidden">
        <button
          type="button"
          onClick={props.onClose}
          className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-[var(--erp-fg-muted)] hover:bg-[var(--erp-bg)]"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <div className="shrink-0 border-b border-[var(--erp-border)] px-4 py-3 pr-12">
          <h2 className="text-base font-semibold text-[var(--erp-fg)]">
            Buscar produto no catálogo
          </h2>
          <p className="mt-0.5 text-xs text-[var(--erp-fg-muted)]">
            Selecione um item para adicionar ao orçamento.
          </p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
          <CrmOrcamentoCatalog
            selectable
            onSelect={(product) => {
              props.onSelect(product);
              props.onClose();
            }}
          />
        </div>
      </section>
    </div>
  );
}
