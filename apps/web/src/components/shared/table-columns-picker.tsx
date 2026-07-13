'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical, RotateCcw, Settings2 } from 'lucide-react';
import type { ColumnDefinition, ColumnPreferenceItem } from '@/src/lib/table-column-preferences';

type TableColumnsPickerProps = {
  definitions: ColumnDefinition[];
  preferences: ColumnPreferenceItem[];
  onToggle: (key: string, visible: boolean) => void;
  onReorder: (fromKey: string, toKey: string) => void;
  onReset: () => void;
  ariaLabel?: string;
};

const MENU_WIDTH = 256;
const MENU_MAX_HEIGHT = 288;

export function TableColumnsPicker({
  definitions,
  preferences,
  onToggle,
  onReorder,
  onReset,
  ariaLabel = 'Configurar colunas',
}: TableColumnsPickerProps) {
  const [open, setOpen] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updateMenuPosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const menuHeight = Math.min(
      MENU_MAX_HEIGHT,
      menuRef.current?.offsetHeight ?? MENU_MAX_HEIGHT,
    );

    let top = rect.bottom + 6;
    if (top + menuHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - menuHeight - 6);
    }

    let left = rect.right - MENU_WIDTH;
    left = Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH - 8));

    setMenuPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
  }, [open, preferences.length, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;

    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const labelByKey = new Map(definitions.map((d) => [d.key, d.label]));
  const requiredByKey = new Map(definitions.map((d) => [d.key, Boolean(d.required)]));

  const menu =
    open && menuPos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[200] w-64 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-2 shadow-xl"
            style={{ top: menuPos.top, left: menuPos.left }}
            role="dialog"
            aria-label="Colunas visíveis"
          >
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                Colunas
              </p>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)] transition hover:bg-white/5 hover:text-[var(--text-primary)]"
                onClick={() => {
                  onReset();
                  setOpen(false);
                }}
              >
                <RotateCcw className="h-3 w-3" aria-hidden />
                Resetar
              </button>
            </div>

            <ul className="max-h-72 space-y-0.5 overflow-y-auto erp-scrollbar">
              {preferences.map((item) => {
                const label = labelByKey.get(item.key) ?? item.key;
                const required = requiredByKey.get(item.key) ?? false;
                const isOver = overKey === item.key && dragKey !== item.key;

                return (
                  <li
                    key={item.key}
                    draggable
                    onDragStart={(e) => {
                      setDragKey(item.key);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', item.key);
                    }}
                    onDragEnd={() => {
                      setDragKey(null);
                      setOverKey(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setOverKey(item.key);
                    }}
                    onDragLeave={() => {
                      if (overKey === item.key) setOverKey(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = dragKey ?? e.dataTransfer.getData('text/plain');
                      if (from) onReorder(from, item.key);
                      setDragKey(null);
                      setOverKey(null);
                    }}
                    className={`flex items-center gap-1.5 rounded-lg px-1 py-1 transition ${
                      isOver ? 'bg-[#2AACE2]/10 ring-1 ring-[#2AACE2]/40' : 'hover:bg-white/5'
                    } ${dragKey === item.key ? 'opacity-50' : ''}`}
                  >
                    <span
                      className="cursor-grab text-[var(--text-muted)] active:cursor-grabbing"
                      aria-hidden
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </span>
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-xs text-[var(--text-primary)]">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-[var(--border-color)]"
                        checked={item.visible}
                        disabled={required}
                        onChange={(e) => onToggle(item.key, e.target.checked)}
                      />
                      <span className="truncate">{label}</span>
                      {required ? (
                        <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                          obrig.
                        </span>
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] text-[var(--text-secondary)] transition hover:bg-white/5 hover:text-[var(--text-primary)]"
        aria-label={ariaLabel}
        title={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Settings2 className="h-4 w-4" aria-hidden />
      </button>
      {menu}
    </>
  );
}
