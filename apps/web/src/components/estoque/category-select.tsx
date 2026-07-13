'use client';

import {
  ChevronDown,
  Loader2,
  Pencil,
  Plus,
  Search,
  X,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

export type CategorySelectDto = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  active: boolean;
};

type CategorySelectProps = {
  categories: CategorySelectDto[];
  /** ID da categoria ou string vazia = sem categoria */
  value: string;
  onChange: (categoryId: string) => void;
  onRefreshCategories: () => Promise<void>;
  onError?: (message: string | null) => void;
  disabled?: boolean;
  id?: string;
};

function normalizeHex(input: string) {
  const h = input.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(h) || /^#[0-9A-Fa-f]{3}$/.test(h)) return h;
  return null;
}

export function CategorySelect({
  categories,
  value,
  onChange,
  onRefreshCategories,
  onError,
  disabled = false,
  id,
}: CategorySelectProps) {
  const autoId = useId();
  const listboxId = `${id ?? autoId}-listbox`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [panelBox, setPanelBox] = useState<{
    top: number;
    left: number;
    width: number;
    transformOrigin: string;
  }>({ top: 0, left: 0, width: 280, transformOrigin: 'top center' });
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createColor, setCreateColor] = useState('#8b5cf6');
  const [createSaving, setCreateSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#8b5cf6');
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const selected = useMemo(
    () => categories.find((c) => c.id === value.trim()) ?? null,
    [categories, value],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...categories].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR'),
    );
    if (!q) return sorted;
    return sorted.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, search]);

  const updatePanelPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === 'undefined') return;
    const r = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 8;
    const maxPanelHeight = 340;
    let width = Math.min(Math.max(280, r.width), vw - 16);
    let left = Math.max(8, Math.min(r.left, vw - width - 8));

    let top = r.bottom + gap;
    let transformOrigin: string = 'top center';
    /** Prefer flipping when little space below. */
    if (vh - top < 160 && r.top > vh - r.bottom) {
      transformOrigin = 'bottom center';
      top = Math.max(12, r.top - gap - maxPanelHeight);
    }
    setPanelBox({
      top,
      left,
      width,
      transformOrigin,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open || !mounted) return;
    updatePanelPosition();
    /** Refine flip using measured panel height after paint. */
    const id = requestAnimationFrame(() => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel || typeof window === 'undefined') return;
      const r = trigger.getBoundingClientRect();
      const ph = panel.getBoundingClientRect().height;
      const vh = window.innerHeight;
      const gap = 8;
      const below = r.bottom + gap;
      if (below + ph > vh - 10 && r.top - gap - ph > 10) {
        const vw = window.innerWidth;
        const width = Math.min(Math.max(280, r.width), vw - 16);
        const left = Math.max(8, Math.min(r.left, vw - width - 8));
        setPanelBox({
          top: Math.max(12, r.top - gap - ph),
          left,
          width,
          transformOrigin: 'bottom center',
        });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [open, mounted, updatePanelPosition, filtered.length, createOpen, editingId]);

  useEffect(() => {
    if (!open || !mounted) return;
    const onScrollResize = () => updatePanelPosition();
    window.addEventListener('resize', onScrollResize);
    window.addEventListener('scroll', onScrollResize, true);
    return () => {
      window.removeEventListener('resize', onScrollResize);
      window.removeEventListener('scroll', onScrollResize, true);
    };
  }, [open, mounted, updatePanelPosition]);

  const closeAll = useCallback(() => {
    setOpen(false);
    setSearch('');
    setCreateOpen(false);
    setCreateName('');
    setCreateColor('#8b5cf6');
    setEditingId(null);
    setEditName('');
    setEditColor('#8b5cf6');
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeAll]);

  useEffect(() => {
    if (!open || !mounted) return;
    const doc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      closeAll();
    };
    document.addEventListener('mousedown', doc);
    return () => document.removeEventListener('mousedown', doc);
  }, [open, mounted, closeAll]);

  const pickSemCategoria = useCallback(() => {
    onChange('');
    closeAll();
  }, [closeAll, onChange]);

  const pickCategory = useCallback(
    (idPick: string) => {
      onChange(idPick);
      closeAll();
    },
    [closeAll, onChange],
  );

  const saveNewCategory = async () => {
    const nm = createName.trim();
    if (!nm) {
      onError?.('Informe o nome da categoria.');
      return;
    }
    setCreateSaving(true);
    onError?.(null);
    try {
      const body: Record<string, string> = { name: nm };
      const hex = normalizeHex(createColor);
      if (hex) body.color = hex;
      const created = await erpFetchJson<CategorySelectDto>(
        'product-categories',
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      );
      await onRefreshCategories();
      onChange(created.id);
      onError?.(null);
      setCreateOpen(false);
      setCreateName('');
      setCreateColor('#8b5cf6');
      setSearch('');
      setOpen(false);
    } catch (e) {
      onError?.(
        e instanceof Error ? e.message : 'Erro ao criar categoria.',
      );
    } finally {
      setCreateSaving(false);
    }
  };

  const startEditCategory = useCallback((category: CategorySelectDto) => {
    setCreateOpen(false);
    setCreateName('');
    setCreateColor('#8b5cf6');
    setEditingId(category.id);
    setEditName(category.name);
    setEditColor(category.color ?? '#8b5cf6');
    onError?.(null);
  }, [onError]);

  const cancelEditCategory = useCallback(() => {
    setEditingId(null);
    setEditName('');
    setEditColor('#8b5cf6');
  }, []);

  const saveEditCategory = async () => {
    if (!editingId) return;
    const nm = editName.trim();
    if (!nm) {
      onError?.('Informe o nome da categoria.');
      return;
    }
    setEditSaving(true);
    onError?.(null);
    try {
      const body: Record<string, string> = { name: nm };
      const hex = normalizeHex(editColor);
      if (hex) body.color = hex;
      await erpFetchJson<CategorySelectDto>(`product-categories/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      await onRefreshCategories();
      onError?.(null);
      cancelEditCategory();
    } catch (e) {
      onError?.(
        e instanceof Error ? e.message : 'Erro ao editar categoria.',
      );
    } finally {
      setEditSaving(false);
    }
  };

  const hasSelection = Boolean(value.trim());
  const showInvalid =
    value.trim().length > 0 && selected === null;

  const panelStyle: CSSProperties = {
    position: 'fixed',
    top: panelBox.top,
    left: panelBox.left,
    width: panelBox.width,
    zIndex: 250,
    maxHeight: 340,
    transformOrigin: panelBox.transformOrigin,
    transitionProperty: 'opacity, transform',
    transitionDuration: '160ms',
    transitionTimingFunction: 'cubic-bezier(0.34, 1.2, 0.64, 1)',
  };

  const dropdown = (
    <div
      ref={panelRef}
      id={listboxId}
      role="listbox"
      aria-label="Lista de categorias"
      style={panelStyle}
      className={[
        'rounded-2xl border border-violet-400/28 bg-white',
        'shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15),0_0_42px_-16px_rgba(139,92,246,0.2)]',
        'backdrop-blur-xl outline-none',
      ].join(' ')}
    >
      <div className="border-b border-gray-200 p-2.5 pb-2">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
            aria-hidden
          />
          <input
            autoFocus={open}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar categoria..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-2 text-[13px] text-gray-900 outline-none placeholder:text-gray-600 focus:border-violet-400/45 focus:ring-[3px] focus:ring-violet-500/20"
          />
        </label>
      </div>

      <div className="max-h-[218px] overflow-y-auto px-2 py-2 scroll-smooth [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent">
        <button
          type="button"
          role="option"
          aria-selected={!hasSelection}
          onClick={pickSemCategoria}
          className={[
            'mb-1.5 flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-[13px] font-medium transition-colors duration-150',
            !hasSelection
              ? 'border-violet-400/50 bg-violet-100 text-violet-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_20px_-10px_rgba(139,92,246,0.2)]'
              : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-200 hover:bg-gray-100 hover:text-gray-900',
          ].join(' ')}
        >
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-gray-400 ring-1 ring-black/30" />
            Sem categoria
          </span>
          {!hasSelection ? (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-700">
              ativo
            </span>
          ) : null}
        </button>

        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-gray-500">
            {search.trim()
              ? 'Nenhuma categoria corresponde à busca.'
              : 'Nenhuma categoria cadastrada. Use “Nova categoria” abaixo.'}
          </p>
        ) : (
          <ul className="space-y-1.5" role="presentation">
            {filtered.map((c) => {
              const isSel = value.trim() === c.id;
              const col = c.color ?? undefined;
              return (
                <li key={c.id} role="presentation">
                  <div
                    className={[
                      'group flex w-full max-w-full items-center gap-1 rounded-xl border transition-all duration-150',
                      value.trim() === c.id
                        ? 'border-violet-400/55 bg-gradient-to-r from-violet-500/25 to-blue-600/14 shadow-[0_0_22px_-10px_rgba(139,92,246,0.55)]'
                        : 'border-gray-200 bg-gray-50 hover:border-gray-200 hover:bg-gray-100',
                    ].join(' ')}
                    style={
                      col && value.trim() !== c.id
                        ? { borderColor: `${col}44` }
                        : col && value.trim() === c.id
                          ? { borderColor: `${col}99` }
                          : undefined
                    }
                  >
                    <button
                      type="button"
                      className="shrink-0 rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-violet-600"
                      aria-label={`Editar categoria ${c.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditCategory(c);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSel}
                      onClick={() => pickCategory(c.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 px-1 py-2 pr-3 text-left"
                    >
                      {col ? (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full ring-[1px] ring-black/40 shadow-[0_0_12px_-2px_rgba(0,0,0,0.5)] transition group-hover:scale-110"
                          style={{ backgroundColor: col }}
                          aria-hidden
                        />
                      ) : (
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gray-500 ring-[1px] ring-black/30" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight text-gray-900">
                        {c.name}
                      </span>
                      {isSel ? (
                        <span className="shrink-0 text-[11px] text-violet-700">
                          ●
                        </span>
                      ) : (
                        <span className="shrink-0 text-[11px] text-gray-600 opacity-0 transition group-hover:opacity-100">
                          Selecionar
                        </span>
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!createOpen && !editingId ? (
        <div className="border-t border-gray-200 p-2">
          <button
            type="button"
            onClick={() => {
              setCreateOpen(true);
              setCreateName('');
              cancelEditCategory();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-400/35 bg-gradient-to-r from-violet-500/[0.12] to-blue-600/[0.1] px-3 py-2.5 text-[13px] font-semibold text-violet-700 transition hover:border-violet-400/55 hover:from-violet-500/[0.2] hover:to-blue-600/[0.16] hover:shadow-[0_0_24px_-12px_rgba(139,92,246,0.45)] active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Nova categoria
          </button>
        </div>
      ) : editingId ? (
        <div className="space-y-2 border-t border-violet-400/20 bg-gray-50 px-3 py-3 transition-opacity duration-200">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
              Editar categoria
            </span>
            <button
              type="button"
              className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Fechar formulário de edição"
              onClick={cancelEditCategory}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Nome único da categoria"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-gray-900 outline-none placeholder:text-gray-600 focus:border-violet-400/45 focus:ring-[3px] focus:ring-violet-500/22"
          />
          <label className="flex items-center gap-2">
            <input
              type="color"
              value={
                /^#[0-9A-Fa-f]{6}$/i.test(editColor.trim())
                  ? editColor.trim()
                  : '#8b5cf6'
              }
              onChange={(e) => setEditColor(e.target.value)}
              className="h-9 w-12 cursor-pointer overflow-hidden rounded-lg border border-gray-200 bg-gray-100 p-0.5 shadow-inner"
              aria-label="Cor da categoria"
            />
            <input
              value={editColor}
              onChange={(e) => setEditColor(e.target.value)}
              placeholder="#8b5cf6"
              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1.5 font-mono text-xs text-gray-900 outline-none focus:border-violet-400/45 focus:ring-2 focus:ring-violet-500/22"
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={editSaving}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
              onClick={cancelEditCategory}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={editSaving}
              onClick={() => void saveEditCategory()}
              className="inline-flex items-center gap-2 rounded-xl border border-violet-400/35 bg-gradient-to-br from-violet-500/[0.3] to-blue-600/[0.2] px-3 py-2 text-[12px] font-bold text-white shadow-[0_0_20px_-10px_rgba(139,92,246,0.5)] hover:border-violet-400/55 disabled:pointer-events-none disabled:opacity-50"
            >
              {editSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando
                </>
              ) : (
                <>
                  <Pencil className="h-3.5 w-3.5" />
                  Salvar alterações
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 border-t border-violet-400/20 bg-gray-50 px-3 py-3 transition-opacity duration-200">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
              Nova categoria
            </span>
            <button
              type="button"
              className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Fechar formulário de categoria"
              onClick={() => {
                setCreateOpen(false);
                setCreateName('');
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <input
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="Nome único da categoria"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-gray-900 outline-none placeholder:text-gray-600 focus:border-violet-400/45 focus:ring-[3px] focus:ring-violet-500/22"
          />
          <label className="flex items-center gap-2">
            <input
              type="color"
              value={
                /^#[0-9A-Fa-f]{6}$/i.test(createColor.trim())
                  ? createColor.trim()
                  : '#8b5cf6'
              }
              onChange={(e) => setCreateColor(e.target.value)}
              className="h-9 w-12 cursor-pointer overflow-hidden rounded-lg border border-gray-200 bg-gray-100 p-0.5 shadow-inner"
              aria-label="Cor da categoria"
            />
            <input
              value={createColor}
              onChange={(e) => setCreateColor(e.target.value)}
              placeholder="#8b5cf6"
              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1.5 font-mono text-xs text-gray-900 outline-none focus:border-violet-400/45 focus:ring-2 focus:ring-violet-500/22"
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={createSaving}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
              onClick={() => {
                setCreateOpen(false);
                setCreateName('');
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={createSaving}
              onClick={() => void saveNewCategory()}
              className="inline-flex items-center gap-2 rounded-xl border border-violet-400/35 bg-gradient-to-br from-violet-500/[0.3] to-blue-600/[0.2] px-3 py-2 text-[12px] font-bold text-white shadow-[0_0_20px_-10px_rgba(139,92,246,0.5)] hover:border-violet-400/55 disabled:pointer-events-none disabled:opacity-50"
            >
              {createSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  Salvar categoria
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative">
      <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.14em] text-gray-500">
        Categoria
      </span>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={[
          'flex min-h-[48px] w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left transition-all duration-150',
          'border border-gray-200 bg-white',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] outline-none backdrop-blur-sm',
          open
            ? 'border-violet-400/50 ring-[3px] ring-violet-500/35 ring-offset-2 ring-offset-white shadow-[0_0_38px_-12px_rgba(139,92,246,0.25)]'
            : 'hover:border-violet-400/38 hover:shadow-[0_0_26px_-14px_rgba(139,92,246,0.28)] focus-visible:border-violet-400/50 focus-visible:ring-[3px] focus-visible:ring-violet-500/32',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer active:scale-[0.997]',
        ].join(' ')}
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {!hasSelection ? (
            <span className="inline-flex items-center gap-2 truncate text-[13px] text-gray-500">
              <span className="h-5 w-1 rounded-full bg-gray-400 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]" />
              Sem categoria — toque para escolher ou criar
            </span>
          ) : showInvalid ? (
            <span className="truncate text-[13px] text-amber-800">
              Referência não encontrada
            </span>
          ) : selected ? (
            <span
              className="inline-flex max-w-full shrink-0 items-center gap-1.5 truncate rounded-xl border px-3 py-1.5 text-[13px] font-semibold tracking-tight text-gray-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition active:translate-y-[0.5px]"
              style={{
                borderColor: selected.color
                  ? `${selected.color}55`
                  : 'rgba(255,255,255,0.12)',
                background: selected.color
                  ? `${selected.color}24`
                  : 'rgba(255,255,255,0.08)',
              }}
            >
              {selected.color ? (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full ring-[1px] ring-black/35"
                  style={{ backgroundColor: selected.color }}
                  aria-hidden
                />
              ) : null}
              <span className="truncate">{selected.name}</span>
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 ${
            open ? 'rotate-180 text-violet-600' : ''
          }`}
          aria-hidden
        />
      </button>
      {mounted && open ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
