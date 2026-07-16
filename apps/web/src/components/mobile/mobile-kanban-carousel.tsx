'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

type MobileKanbanCarouselProps<T extends { id: string; title: string }> = {
  columns: T[];
  renderColumn: (column: T, index: number) => ReactNode;
  className?: string;
  /** Colunas a 85vw com peek da próxima (CRM). */
  peekColumns?: boolean;
};

export function MobileKanbanCarousel<T extends { id: string; title: string }>(
  props: MobileKanbanCarouselProps<T>,
) {
  const { columns, renderColumn, className = '', peekColumns = false } = props;
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const activeIndexRef = useRef(0);

  activeIndexRef.current = activeIndex;

  const getSlideWidth = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return 0;
    if (peekColumns) {
      return Math.round(el.clientWidth * 0.85);
    }
    return el.clientWidth;
  }, [peekColumns]);

  const scrollToIndex = useCallback(
    (index: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const clamped = Math.max(0, Math.min(index, columns.length - 1));
      setActiveIndex(clamped);
      const slideWidth = getSlideWidth();
      if (slideWidth <= 0) return;
      el.scrollTo({ left: clamped * slideWidth, behavior: 'smooth' });
    },
    [columns.length, getSlideWidth],
  );

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.clientWidth <= 0) return;
    const slideWidth = getSlideWidth() || el.clientWidth;
    const index = Math.round(el.scrollLeft / slideWidth);
    setActiveIndex(Math.max(0, Math.min(index, columns.length - 1)));
  }, [columns.length, getSlideWidth]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const syncWidth = () => {
      const slideWidth = getSlideWidth();
      if (slideWidth <= 0) return;
      el.scrollTo({
        left: activeIndexRef.current * slideWidth,
        behavior: 'auto',
      });
    };
    syncWidth();
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncWidth) : null;
    ro?.observe(el);
    window.addEventListener('orientationchange', syncWidth);
    return () => {
      ro?.disconnect();
      window.removeEventListener('orientationchange', syncWidth);
    };
  }, [getSlideWidth, columns.length]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? 0;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    if (Math.abs(dx) < 40) return;
    scrollToIndex(activeIndex + (dx < 0 ? 1 : -1));
  };

  if (columns.length === 0) return null;

  return (
    <div
      className={`erp-mobile-kanban${peekColumns ? ' erp-mobile-kanban--peek' : ''} ${className}`}
    >
      <div
        ref={scrollRef}
        className="erp-mobile-kanban-track"
        onScroll={onScroll}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {columns.map((column, index) => (
          <div key={column.id} className="erp-mobile-kanban-slide">
            {renderColumn(column, index)}
          </div>
        ))}
      </div>
      {columns.length > 1 ? (
        <div className="erp-mobile-kanban-dots" role="tablist" aria-label="Colunas">
          {columns.map((column, index) => (
            <button
              key={column.id}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              aria-label={column.title}
              className={`erp-mobile-kanban-dot${
                index === activeIndex ? ' erp-mobile-kanban-dot--active' : ''
              }`}
              onClick={() => scrollToIndex(index)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
