'use client';

import { useCallback, useRef } from 'react';

type SwipeBackOptions = {
  onBack: () => void;
  threshold?: number;
  enabled?: boolean;
};

export function useSwipeBack(options: SwipeBackOptions) {
  const { onBack, threshold = 80, enabled = true } = options;
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;
      const touch = e.touches[0];
      if (!touch) return;
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      tracking.current = touch.clientX <= 48;
    },
    [enabled],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !tracking.current) return;
      tracking.current = false;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - startX.current;
      const dy = Math.abs(touch.clientY - startY.current);
      if (dx >= threshold && dy < threshold) {
        onBack();
      }
    },
    [enabled, onBack, threshold],
  );

  return { onTouchStart, onTouchEnd };
}
