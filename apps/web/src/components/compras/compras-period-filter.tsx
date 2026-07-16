'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { DualDateCalendar } from '@/src/components/expedicao/workspace/dual-date-calendar';
import {
  endOfUtcMonthFromYmd,
  formatPeriodShortLabel,
  startOfUtcMonthFromYmd,
} from '@/src/lib/period-range';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function getCurrentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const from = `${y}-${pad(m + 1)}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const to = `${y}-${pad(m + 1)}-${pad(lastDay)}`;
  return { from, to };
}

export function shiftMonthRange(
  from: string,
  to: string,
  delta: number,
): { from: string; to: string } {
  const anchor = from.trim() || to.trim() || new Date().toISOString().slice(0, 10);
  const d = new Date(`${anchor}T12:00:00`);
  d.setMonth(d.getMonth() + delta);
  const y = d.getFullYear();
  const m = d.getMonth();
  const nextFrom = `${y}-${pad(m + 1)}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const nextTo = `${y}-${pad(m + 1)}-${pad(lastDay)}`;
  return { from: nextFrom, to: nextTo };
}

function formatPeriodLabel(from: string, to: string): string {
  if (!from.trim() && !to.trim()) return 'Período';
  const fmt = (iso: string) => {
    if (!iso.trim()) return null;
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return iso;
    return `${d}/${m}`;
  };
  const a = fmt(from);
  const b = fmt(to);
  if (a && b) return `${a} — ${b}`;
  if (a) return `A partir de ${a}`;
  if (b) return `Até ${b}`;
  return 'Período';
}

function isFullMonthRange(from: string, to: string): boolean {
  if (!from.trim() || !to.trim()) return false;
  return (
    from === startOfUtcMonthFromYmd(from) &&
    to === endOfUtcMonthFromYmd(from) &&
    startOfUtcMonthFromYmd(from) === startOfUtcMonthFromYmd(to)
  );
}

type PopoverPos = { top: number; left: number };

function computePopoverPosition(anchor: DOMRect, popover: DOMRect): PopoverPos {
  const margin = 8;
  const gap = 6;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = anchor.right - popover.width;
  if (left < margin) left = margin;
  if (left + popover.width > vw - margin) {
    left = Math.max(margin, vw - margin - popover.width);
  }

  let top = anchor.bottom + gap;
  if (top + popover.height > vh - margin) {
    const above = anchor.top - gap - popover.height;
    if (above >= margin) top = above;
    else top = Math.max(margin, vh - margin - popover.height);
  }

  return { top, left };
}

export function ComprasPeriodFilter(props: {
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
  /** Oculta o botão "Todos" (ex.: dashboard com filtro de módulo separado). */
  hideAllPreset?: boolean;
}) {
  const { dateFrom, dateTo, onChange, hideAllPreset = false } = props;
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(dateFrom);
  const [draftTo, setDraftTo] = useState(dateTo);
  const [popoverPos, setPopoverPos] = useState<PopoverPos | null>(null);
  const [mounted, setMounted] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const hasPeriod = Boolean(dateFrom.trim() || dateTo.trim());
  const monthLabel = hasPeriod
    ? formatPeriodShortLabel(dateFrom || dateTo)
    : formatPeriodShortLabel(getCurrentMonthRange().from);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setDraftFrom(dateFrom);
    setDraftTo(dateTo);
  }, [open, dateFrom, dateTo]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !btnRef.current || !popoverRef.current) return;

    const update = () => {
      if (!btnRef.current || !popoverRef.current) return;
      setPopoverPos(
        computePopoverPosition(
          btnRef.current.getBoundingClientRect(),
          popoverRef.current.getBoundingClientRect(),
        ),
      );
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, draftFrom, draftTo]);

  const periodLabel = formatPeriodLabel(dateFrom, dateTo);
  const showingCustomPeriod = hasPeriod && !isFullMonthRange(dateFrom, dateTo);

  const popover =
    open && mounted ? (
      <div
        ref={popoverRef}
        className="exp-period-filter-popover exp-period-filter-popover--calendar exp-period-filter-popover--fixed"
        style={
          popoverPos
            ? { top: popoverPos.top, left: popoverPos.left }
            : { visibility: 'hidden' as const }
        }
        role="dialog"
        aria-label="Selecionar período"
      >
        <DualDateCalendar
          dateFrom={draftFrom}
          dateTo={draftTo}
          onChangeFrom={setDraftFrom}
          onChangeTo={setDraftTo}
        />
        <div className="exp-period-filter-actions">
          <button
            type="button"
            className="exp-period-filter-action exp-period-filter-action--ghost"
            onClick={() => {
              setDraftFrom('');
              setDraftTo('');
              onChange('', '');
              setOpen(false);
            }}
          >
            Limpar
          </button>
          <button
            type="button"
            className="exp-period-filter-action exp-period-filter-action--primary"
            onClick={() => {
              onChange(draftFrom, draftTo);
              setOpen(false);
            }}
          >
            Aplicar
          </button>
        </div>
      </div>
    ) : null;

  const goMonth = (delta: number) => {
    const base = hasPeriod
      ? { from: dateFrom, to: dateTo }
      : getCurrentMonthRange();
    const next = shiftMonthRange(base.from, base.to, delta);
    onChange(next.from, next.to);
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {hideAllPreset ? null : !hasPeriod ? (
        <div className="exp-period-filter-group inline-flex items-center rounded-lg border border-gray-200 bg-transparent">
          <button
            type="button"
            className="exp-period-filter-btn exp-period-filter-btn--preset exp-period-filter-btn--group border-0 bg-transparent"
            onClick={() => onChange('', '')}
            title="Ver todo o período (sem filtro de data)"
            aria-pressed
          >
            Todos
          </button>
          <button
            type="button"
            className="exp-period-filter-btn exp-period-filter-btn--preset exp-period-filter-btn--group border-0 bg-transparent px-1.5"
            onClick={() => {
              const current = getCurrentMonthRange();
              onChange(current.from, current.to);
            }}
            title="Cancelar seleção de Todos (voltar ao mês atual)"
            aria-label="Cancelar filtro Todos"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="exp-period-filter-btn exp-period-filter-btn--preset"
          onClick={() => onChange('', '')}
          title="Ver todo o período (sem filtro de data)"
          aria-pressed={false}
        >
          Todos
        </button>
      )}

      <div className="exp-period-filter-group inline-flex items-center rounded-lg border border-gray-200 bg-transparent">
        <button
          type="button"
          className="exp-period-filter-btn exp-period-filter-btn--group rounded-none border-0 bg-transparent px-2"
          onClick={() => goMonth(-1)}
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={`exp-period-filter-btn exp-period-filter-btn--group rounded-none border-0 bg-transparent px-2 text-xs font-semibold${
            hasPeriod && isFullMonthRange(dateFrom, dateTo)
              ? ' exp-period-filter-btn--active'
              : ''
          }`}
          onClick={() => {
            const current = getCurrentMonthRange();
            onChange(current.from, current.to);
          }}
          title="Ir para o mês atual"
        >
          {monthLabel}
        </button>
        <button
          type="button"
          className="exp-period-filter-btn exp-period-filter-btn--group rounded-none border-0 bg-transparent px-2"
          onClick={() => goMonth(1)}
          aria-label="Próximo mês"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="exp-period-filter-wrap" ref={wrapRef}>
        <button
          ref={btnRef}
          type="button"
          className={`exp-period-filter-btn${showingCustomPeriod ? ' exp-period-filter-btn--active' : ''}`}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
          <span>{showingCustomPeriod ? periodLabel : 'Período'}</span>
        </button>
        {popover ? createPortal(popover, document.body) : null}
      </div>
    </div>
  );
}
