'use client';

import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { CrmOrcamentoCatalog } from '@/src/components/crm/orcamentos/crm-orcamento-catalog';
import { useIsMobileKanban } from '@/src/hooks/use-is-mobile-kanban';
import type { QuoteCatalogProductDto } from '@/src/services/api/quotes-api';

export function CrmOrcamentoCatalogPickerModal(props: {
  open: boolean;
  onClose: () => void;
  onSelect: (product: QuoteCatalogProductDto) => void;
}) {
  const isMobile = useIsMobileKanban();
  const [pending, setPending] = useState<QuoteCatalogProductDto | null>(null);

  useEffect(() => {
    if (!props.open) setPending(null);
  }, [props.open]);

  if (!props.open) return null;

  const handleSelect = (product: QuoteCatalogProductDto) => {
    if (isMobile) {
      setPending((prev) => (prev?.id === product.id ? null : product));
      return;
    }
    props.onSelect(product);
    props.onClose();
  };

  const handleConfirm = () => {
    if (!pending) return;
    props.onSelect(pending);
    setPending(null);
    props.onClose();
  };

  const handleCancelSelection = () => {
    // Só limpa a seleção — mantém busca, filtros e posição de scroll do catálogo.
    setPending(null);
  };

  const handleClose = () => {
    setPending(null);
    props.onClose();
  };

  return (
    <div className="erp-modal-overlay">
      <div className="erp-modal-backdrop" aria-hidden onClick={handleClose} />
      <section className="erp-modal-panel catalog-search-modal relative flex max-h-[80vh] w-full max-w-5xl flex-col overflow-hidden md:max-h-[80vh]">
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-3 top-3 z-20 rounded-md p-1.5 text-[var(--erp-fg-muted)] hover:bg-[var(--erp-bg)]"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <div className="shrink-0 border-b border-[var(--erp-border)] px-4 py-3 pr-12">
          <h2 className="text-base font-semibold text-[var(--erp-fg)]">
            Buscar produto no catálogo
          </h2>
          <p className="mt-0.5 text-xs text-[var(--erp-fg-muted)]">
            {isMobile
              ? 'Toque em um produto e confirme no topo para adicionar.'
              : 'Selecione um item para adicionar ao orçamento.'}
          </p>
        </div>

        {isMobile ? (
          <div className="sticky top-0 z-10 flex min-h-[3.25rem] shrink-0 items-center gap-2 border-b border-[var(--erp-border)] bg-[var(--erp-card)] px-3 py-2">
            {pending ? (
              <>
                <button
                  type="button"
                  onClick={handleCancelSelection}
                  className="erp-focus-ring inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-[var(--erp-border)] bg-white px-3 text-sm font-semibold text-[var(--erp-fg-secondary)]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="erp-focus-ring inline-flex min-h-11 flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-[var(--erp-accent,#2AACE2)] px-3 text-sm font-bold text-white"
                >
                  <Check className="h-4 w-4" aria-hidden />
                  Confirmar
                </button>
              </>
            ) : (
              <p className="w-full text-center text-xs font-medium text-[var(--erp-fg-muted)]">
                Toque em um item para selecionar
              </p>
            )}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
          <CrmOrcamentoCatalog
            selectable
            selectedId={isMobile ? pending?.id ?? null : null}
            selectMode={isMobile ? 'confirm' : 'immediate'}
            onSelect={handleSelect}
          />
        </div>
      </section>
    </div>
  );
}
