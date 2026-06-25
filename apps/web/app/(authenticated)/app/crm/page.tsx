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
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500"
      >
        Abrir CRM novamente
      </a>
    </div>
  );
}
