'use client';

import { FileSpreadsheet, Filter, Plus, RefreshCw, Upload } from 'lucide-react';
import { GlowButton } from '@/src/components/shell/glow-button';
import { ThemeToggle } from '@/src/components/theme/theme-toggle';

export function ExpeditionHeader(props: {
  title?: string;
  subtitle?: string;
  onRefresh: () => void;
  refreshing?: boolean;
  onOpenFilters: () => void;
  filterCount?: number;
  onNewOrder?: () => void;
  onImportWeg?: () => void;
  onNewWeg?: () => void;
  showWegActions?: boolean;
}) {
  const {
    title = 'Expedição',
    subtitle = 'Triagem operacional — reservar, priorizar e enviar para separação sem sair da fila.',
    onRefresh,
    refreshing,
    onOpenFilters,
    filterCount = 0,
    onNewOrder,
    onImportWeg,
    onNewWeg,
    showWegActions = true,
  } = props;

  return (
    <header className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="erp-page-title text-3xl font-semibold tracking-tight sm:text-[2.125rem]">
            {title}
          </h1>
          <p className="erp-page-subtitle mt-2 max-w-3xl text-[15px] leading-relaxed">
            {subtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ThemeToggle />
          {onNewOrder ? (
            <GlowButton
              variant="secondary"
              type="button"
              className="min-h-[44px] gap-2 px-4"
              onClick={onNewOrder}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Pedido manual
            </GlowButton>
          ) : null}
          {showWegActions && onNewWeg ? (
            <GlowButton
              variant="primary"
              type="button"
              className="min-h-[44px] gap-2 px-5 font-semibold"
              onClick={onNewWeg}
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              Novo pedido WEG
            </GlowButton>
          ) : null}
          {showWegActions && onImportWeg ? (
            <GlowButton
              variant="secondary"
              type="button"
              className="min-h-[44px] gap-2 px-4"
              onClick={onImportWeg}
            >
              <Upload className="h-4 w-4" aria-hidden />
              Importar WEG
            </GlowButton>
          ) : null}
          <GlowButton
            variant="secondary"
            type="button"
            className="min-h-[44px] gap-2 px-4"
            disabled={refreshing}
            onClick={onRefresh}
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
              aria-hidden
            />
            Atualizar
          </GlowButton>
          <button
            type="button"
            onClick={onOpenFilters}
            className="erp-filter-chip-btn min-h-[44px]"
          >
            <Filter className="h-4 w-4 text-[var(--erp-accent)]" aria-hidden />
            Filtros
            {filterCount > 0 ? (
              <span className="erp-glow-badge erp-glow-badge--sm erp-glow-badge--accent flex min-h-[1.35rem] min-w-[1.35rem] items-center justify-center rounded-full px-2 font-mono tabular-nums">
                {filterCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </header>
  );
}
