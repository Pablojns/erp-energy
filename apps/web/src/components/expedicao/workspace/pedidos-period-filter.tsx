'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays } from 'lucide-react';
import { DualDateCalendar } from '@/src/components/expedicao/workspace/dual-date-calendar';

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

type PopoverPos = { top: number; left: number };

function computePopoverPosition(
  anchor: DOMRect,
  popover: DOMRect,
): PopoverPos {
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

export function PedidosPeriodFilter(props: {
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
}) {
  const { dateFrom, dateTo, onChange } = props;
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(dateFrom);
  const [draftTo, setDraftTo] = useState(dateTo);
  const [popoverPos, setPopoverPos] = useState<PopoverPos | null>(null);
  const [mounted, setMounted] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

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

  const label = formatPeriodLabel(dateFrom, dateTo);
  const hasPeriod = Boolean(dateFrom.trim() || dateTo.trim());

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

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={`exp-period-filter-btn exp-period-filter-btn--preset${!hasPeriod ? ' exp-period-filter-btn--active' : ''}`}
        onClick={() => onChange('', '')}
      >
        Todos
      </button>
      <div className="exp-period-filter-wrap" ref={wrapRef}>
        <button
          ref={btnRef}
          type="button"
          className={`exp-period-filter-btn${hasPeriod ? ' exp-period-filter-btn--active' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
          <span>{label}</span>
        </button>
        {popover ? createPortal(popover, document.body) : null}
      </div>
    </div>
  );
}
