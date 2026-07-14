'use client';

import { useCallback, useRef, useState } from 'react';

type UseCardSwipeOptions = {
  sectionCount: number;
  /** Distância mínima em px para contar como swipe (não tap). */
  tapThreshold?: number;
  onTap?: () => void;
};

/**
 * Swipe horizontal fluido entre seções de um card.
 * touchmove aplica translateX; touchend faz snap com transition.
 */
export function useCardSwipe(options: UseCardSwipeOptions) {
  const { sectionCount, tapThreshold = 10, onTap } = options;
  const startX = useRef(0);
  const widthRef = useRef(0);
  const tracking = useRef(false);
  const moved = useRef(false);
  const indexRef = useRef(0);
  const offsetRef = useRef(0);
  const [index, setIndex] = useState(0);
  const [offsetPx, setOffsetPx] = useState(0);
  const [dragging, setDragging] = useState(false);

  const clampIndex = useCallback(
    (value: number) => Math.max(0, Math.min(sectionCount - 1, value)),
    [sectionCount],
  );

  const commitOffset = useCallback((px: number) => {
    offsetRef.current = px;
    setOffsetPx(px);
  }, []);

  const commitIndex = useCallback(
    (next: number) => {
      const clamped = clampIndex(next);
      indexRef.current = clamped;
      setIndex(clamped);
      const width = widthRef.current || 0;
      commitOffset(-clamped * width);
    },
    [clampIndex, commitOffset],
  );

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    const el = e.currentTarget as HTMLElement;
    widthRef.current = el.clientWidth || 1;
    startX.current = touch.clientX;
    tracking.current = true;
    moved.current = false;
    setDragging(true);
  }, []);

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!tracking.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startX.current;
      if (Math.abs(dx) > tapThreshold) moved.current = true;
      const base = -indexRef.current * widthRef.current;
      const next = base + dx;
      const min = -(sectionCount - 1) * widthRef.current;
      commitOffset(Math.max(min, Math.min(0, next)));
    },
    [commitOffset, sectionCount, tapThreshold],
  );

  const onTouchEnd = useCallback(() => {
    if (!tracking.current) return;
    tracking.current = false;
    setDragging(false);

    const width = widthRef.current || 1;

    if (!moved.current) {
      commitOffset(-indexRef.current * width);
      onTap?.();
      return;
    }

    const projected = -offsetRef.current / width;
    commitIndex(Math.round(projected));
  }, [commitIndex, commitOffset, onTap]);

  const viewportRef = useRef<HTMLDivElement | null>(null);

  const setViewportRef = useCallback((node: HTMLDivElement | null) => {
    viewportRef.current = node;
    if (node) widthRef.current = node.clientWidth || 1;
  }, []);

  const goTo = useCallback(
    (next: number) => {
      if (viewportRef.current) {
        widthRef.current = viewportRef.current.clientWidth || 1;
      }
      commitIndex(next);
    },
    [commitIndex],
  );

  const trackStyle: React.CSSProperties = {
    transform: `translateX(${offsetPx}px)`,
    transition: dragging ? 'none' : 'transform 250ms ease-out',
    width: `${sectionCount * 100}%`,
  };

  return {
    index,
    goTo,
    trackStyle,
    setViewportRef,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
