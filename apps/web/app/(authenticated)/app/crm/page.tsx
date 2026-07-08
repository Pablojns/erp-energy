'use client';

import { useEffect } from 'react';

export default function CrmPage() {
  useEffect(() => {
    window.open('http://174.138.41.33:3003', '_blank');
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <p className="text-sm text-zinc-400">O CRM foi aberto em uma nova aba.</p>
      <a
        href="http://174.138.41.33:3003"
        target="_blank"
        rel="noopener noreferrer"
        className="erp-focus-ring erp-btn erp-btn-primary erp-btn--md"
      >
        Abrir CRM novamente
      </a>
    </div>
  );
}
