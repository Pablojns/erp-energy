'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Filter, X } from 'lucide-react';
import type { SavedFilterPreset } from '@/src/lib/saved-filters';
import {
  deleteSavedFilter,
  loadSavedFilters,
  saveNamedFilter,
} from '@/src/lib/saved-filters';

export type FilterBadgeItem = {
  key: string;
  label: string;
  tone?: string;
  style?: CSSProperties;
};

type ErpFilterBarProps<T> = {
  storageKey: string;
  badges: FilterBadgeItem[];
  hasActiveFilters: boolean;
  onRemoveBadge: (key: string) => void;
  onClearAll: () => void;
  presetValue: T;
  onApplyPreset: (value: T) => void;
  /** Conteúdo antes dos badges/painel (ex.: botões Filtros / Período no cabeçalho). */
  leadingToolbar?: React.ReactNode;
  children: React.ReactNode;
  searchSlot?: React.ReactNode;
  panelTitle?: string;
  /** Oculta o botão interno — use com `toolbarSlot` no cabeçalho. */
  hideFilterButton?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Rótulo do botão de criar filtro (ex.: "+ Novo Filtro"). */
  createFilterLabel?: string;
  /** Ao informado, substitui o fluxo inline de salvar pelo callback (ex.: abrir modal). */
  onCreateFilter?: () => void;
  /** Incrementar para recarregar lista de filtros salvos do localStorage. */
  savedFiltersVersion?: number;
  /** Oculta a seção "Filtros rápidos" (quando integrada em outro componente). */
  hideSavedPresetsList?: boolean;
};

export type ErpFilterBarToolbarApi = {
  toggle: () => void;
  open: boolean;
  badgeCount: number;
};

export function ErpFilterBar<T>(props: ErpFilterBarProps<T>) {
  const {
    storageKey,
    badges,
    hasActiveFilters,
    onRemoveBadge,
    onClearAll,
    presetValue,
    onApplyPreset,
    children,
    searchSlot,
    panelTitle = 'Filtros',
    hideFilterButton = false,
    open: openControlled,
    onOpenChange,
    createFilterLabel = '+ Salvar filtro',
    onCreateFilter,
    savedFiltersVersion = 0,
    hideSavedPresetsList = false,
    leadingToolbar,
  } = props;

  const [openInternal, setOpenInternal] = useState(false);
  const open = openControlled ?? openInternal;
  const setOpen = (value: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof value === 'function' ? value(open) : value;
    if (onOpenChange) onOpenChange(next);
    else setOpenInternal(next);
  };
  const [saved, setSaved] = useState<SavedFilterPreset<T>[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSaved(loadSavedFilters<T>(storageKey));
  }, [storageKey, open, savedFiltersVersion]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const handleSave = () => {
    try {
      saveNamedFilter(storageKey, saveName, presetValue);
      setSaved(loadSavedFilters<T>(storageKey));
      setSaveOpen(false);
      setSaveName('');
      setSaveError(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Falha ao salvar filtro.');
    }
  };

  return (
    <div className={`erp-filter-bar ${hideFilterButton ? 'erp-filter-bar--header-btn' : ''}`}>
      <div className="erp-filter-bar-controls" ref={wrapRef}>
        {leadingToolbar}
        {!hideFilterButton ? (
          <button
            type="button"
            className={`erp-filter-bar-btn ${open ? 'erp-filter-bar-btn--open' : ''}`}
            onClick={() => setOpen((v) => !v)}
          >
            <Filter className="h-4 w-4" aria-hidden />
            Filtros
            {badges.length > 0 ? (
              <span className="erp-filter-bar-count">{badges.length}</span>
            ) : null}
          </button>
        ) : null}

        {badges.map((badge) => (
          <span
            key={badge.key}
            className={`erp-filter-badge${badge.tone ? ` erp-filter-badge--${badge.tone}` : ''}`}
            style={badge.style}
          >
            {badge.label}
            <button
              type="button"
              className="erp-filter-badge-remove"
              aria-label={`Remover filtro ${badge.label}`}
              onClick={() => onRemoveBadge(badge.key)}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        {hasActiveFilters ? (
          <button type="button" className="erp-filter-clear-btn" onClick={onClearAll}>
            Limpar filtros
          </button>
        ) : null}

        {open ? (
          <div className="erp-filter-panel">
            <div className="erp-filter-panel-head">
              <h4>{panelTitle}</h4>
            </div>
            <div className="erp-filter-panel-body">{children}</div>

            {saved.length > 0 && !hideSavedPresetsList ? (
              <div className="erp-filter-saved">
                <p className="erp-filter-saved-title">Filtros rápidos</p>
                <div className="erp-filter-saved-list">
                  {saved.map((preset) => (
                    <div key={preset.id} className="erp-filter-saved-row">
                      <button
                        type="button"
                        className="erp-filter-saved-apply"
                        onClick={() => {
                          onApplyPreset(preset.value);
                          setOpen(false);
                        }}
                      >
                        {preset.name}
                      </button>
                      <button
                        type="button"
                        className="erp-filter-saved-delete"
                        aria-label={`Excluir filtro ${preset.name}`}
                        onClick={() => {
                          deleteSavedFilter(storageKey, preset.id);
                          setSaved(loadSavedFilters<T>(storageKey));
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="erp-filter-panel-foot">
              {onCreateFilter ? (
                <button
                  type="button"
                  className="erp-filter-save-btn"
                  onClick={onCreateFilter}
                >
                  {createFilterLabel}
                </button>
              ) : saveOpen ? (
                <div className="erp-filter-save-form">
                  <input
                    type="text"
                    value={saveName}
                    onChange={(e) => {
                      setSaveName(e.target.value);
                      setSaveError(null);
                    }}
                    placeholder="Nome do filtro"
                    className="erp-filter-save-input"
                  />
                  <button type="button" className="erp-filter-save-confirm" onClick={handleSave}>
                    Salvar
                  </button>
                  <button
                    type="button"
                    className="erp-filter-save-cancel"
                    onClick={() => {
                      setSaveOpen(false);
                      setSaveName('');
                      setSaveError(null);
                    }}
                  >
                    Cancelar
                  </button>
                  {saveError ? <p className="erp-filter-save-error">{saveError}</p> : null}
                </div>
              ) : (
                <button
                  type="button"
                  className="erp-filter-save-btn"
                  disabled={!hasActiveFilters}
                  onClick={() => setSaveOpen(true)}
                >
                  {createFilterLabel}
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
      {searchSlot}
    </div>
  );
}
