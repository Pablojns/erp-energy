'use client';

import { useEffect, useState } from 'react';

/** Viewport &lt; 768px — alinhado a mobile.css */
export function useIsMobileKanban(): boolean {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return mobile;
}
