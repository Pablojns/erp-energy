'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const;

function parseIsoDate(iso: string): Date | null {
  if (!iso.trim()) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return dt;
}

function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ day: number | null; iso: string | null }> = [];

  for (let i = 0; i < startDay; i += 1) {
    cells.push({ day: null, iso: null });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      day,
      iso: formatIsoDate(new Date(year, month, day)),
    });
  }
  return cells;
}

function MonthCalendar(props: {
  panelLabel: string;
  selected: string;
  onSelect: (iso: string) => void;
  viewDate: Date;
  onViewDateChange: (next: Date) => void;
}) {
  const { panelLabel, selected, onSelect, viewDate, onViewDateChange } = props;
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const todayIso = formatIsoDate(new Date());

  const monthLabel = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(viewDate);

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);

  const shiftMonth = (delta: number) => {
    onViewDateChange(new Date(year, month + delta, 1));
  };

  return (
    <div className="exp-cal-panel">
      <p className="exp-cal-panel-title">{panelLabel}</p>
      <div className="exp-cal-nav">
        <button
          type="button"
          className="exp-cal-nav-btn"
          aria-label="Mês anterior"
          onClick={() => shiftMonth(-1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="exp-cal-month-label">{monthLabel}</span>
        <button
          type="button"
          className="exp-cal-nav-btn"
          aria-label="Próximo mês"
          onClick={() => shiftMonth(1)}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="exp-cal-weekdays">
        {WEEKDAYS.map((w, index) => (
          <span key={`weekday-${index}-${w}`} className="exp-cal-weekday">
            {w}
          </span>
        ))}
      </div>
      <div className="exp-cal-grid">
        {cells.map((cell, index) => {
          if (cell.day == null || !cell.iso) {
            return (
              <span
                key={`empty-${year}-${month}-${index}`}
                className="exp-cal-day exp-cal-day--empty"
                aria-hidden
              />
            );
          }
          const isSelected = selected === cell.iso;
          const isToday = todayIso === cell.iso;
          return (
            <button
              key={cell.iso}
              type="button"
              className={`exp-cal-day${isSelected ? ' exp-cal-day--selected' : ''}${isToday && !isSelected ? ' exp-cal-day--today' : ''}`}
              onClick={() => onSelect(cell.iso!)}
              aria-label={cell.iso}
              aria-pressed={isSelected}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DualDateCalendar(props: {
  dateFrom: string;
  dateTo: string;
  onChangeFrom: (iso: string) => void;
  onChangeTo: (iso: string) => void;
}) {
  const { dateFrom, dateTo, onChangeFrom, onChangeTo } = props;
  const today = new Date();

  const [viewFrom, setViewFrom] = useState(() => {
    return parseIsoDate(dateFrom) ?? new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [viewTo, setViewTo] = useState(() => {
    return parseIsoDate(dateTo) ?? new Date(today.getFullYear(), today.getMonth(), 1);
  });

  return (
    <div className="exp-dual-calendar">
      <MonthCalendar
        panelLabel="De"
        selected={dateFrom}
        onSelect={onChangeFrom}
        viewDate={viewFrom}
        onViewDateChange={setViewFrom}
      />
      <MonthCalendar
        panelLabel="Até"
        selected={dateTo}
        onSelect={onChangeTo}
        viewDate={viewTo}
        onViewDateChange={setViewTo}
      />
    </div>
  );
}
