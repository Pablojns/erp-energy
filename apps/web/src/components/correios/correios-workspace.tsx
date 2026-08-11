'use client';

import { useState } from 'react';
import type { TabId } from '@/src/components/correios/correios-helpers';
import { CorreiosCotacaoPanel } from '@/src/components/correios/correios-cotacao-panel';
import { CorreiosEtiquetaPanel } from '@/src/components/correios/correios-etiqueta-panel';
import { CorreiosLogisticaReversaPanel } from '@/src/components/correios/correios-logistica-reversa-panel';
import { CorreiosPedidosPanel } from '@/src/components/correios/correios-pedidos-panel';
import { CorreiosRastreamentoPanel } from '@/src/components/correios/correios-rastreamento-panel';

export function CorreiosWorkspace() {
  const [tab, setTab] = useState<TabId>('cotacao');

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'cotacao', label: 'Cotação de Frete' },
    { id: 'rastreamento', label: 'Rastreamento' },
    { id: 'etiqueta', label: 'Etiqueta Manual' },
    { id: 'logistica-reversa', label: 'Logística Reversa' },
    { id: 'pedidos', label: 'Acompanhamento de Pedidos' },
  ];

  return (
    <div className="scroll-mt-8 space-y-4 pt-2 sm:pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Correios</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Cotação, rastreamento e acompanhamento de envios.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              tab === item.id
                ? 'bg-[var(--accent)] text-[var(--color-text-inverse)]'
                : 'border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'cotacao' ? <CorreiosCotacaoPanel /> : null}
      {tab === 'rastreamento' ? <CorreiosRastreamentoPanel /> : null}
      {tab === 'etiqueta' ? <CorreiosEtiquetaPanel /> : null}
      {tab === 'logistica-reversa' ? <CorreiosLogisticaReversaPanel /> : null}
      {tab === 'pedidos' ? <CorreiosPedidosPanel /> : null}
    </div>
  );
}
