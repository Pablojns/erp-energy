import { Suspense } from 'react';
import { EstoqueWorkspace } from '@/src/components/estoque/estoque-workspace';

function EstoqueFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-500">
      Carregando estoque…
    </div>
  );
}

export default function EstoquePage() {
  return (
    <Suspense fallback={<EstoqueFallback />}>
      <EstoqueWorkspace />
    </Suspense>
  );
}
