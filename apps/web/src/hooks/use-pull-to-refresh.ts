'use client';

import { useCallback, useRef, useState } from 'react';

type PullToRefreshOptions = {
  onRefresh: () => void | Promise<void>;
  threshold?: number;
  disabled?: boolean;
};

export function usePullToRefresh(options: PullToRefreshOptions) {
  const { onRefresh, threshold = 72, disabled = false } = options;
  const startY = useRef(0);
  const pulling = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || refreshing) return;
      const el = e.currentTarget as HTMLElement;
      if (el.scrollTop > 0) return;
      startY.current = e.touches[0]?.clientY ?? 0;
      pulling.current = true;
    },
    [disabled, refreshing],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!pulling.current || disabled || refreshing) return;
      const y = e.touches[0]?.clientY ?? 0;
      const delta = Math.max(0, y - startY.current);
      setPullDistance(Math.min(delta, threshold * 1.5));
    },
    [disabled, refreshing, threshold],
  );

  const onTouchEnd = useCallback(async () => {
    if (!pulling.current || disabled) return;
    pulling.current = false;
    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
    setPullDistance(0);
  }, [disabled, onRefresh, pullDistance, refreshing, threshold]);

  return {
    pullDistance,
    refreshing,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
