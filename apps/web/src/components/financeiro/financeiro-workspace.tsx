'use client';

import { useState } from 'react';
import { FinanceiroDashboardTab } from '@/src/components/financeiro/dashboard-tab';
import { FinanceiroDespesasTab } from '@/src/components/financeiro/despesas-tab';
import { FinanceiroExtratoTab } from '@/src/components/financeiro/extrato-tab';
import { FinanceiroNfsTab } from '@/src/components/financeiro/nfs-tab';
import type { FinanceiroTab } from '@/src/components/financeiro/types';

const TABS: { id: FinanceiroTab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'nfs', label: 'NFs em Aberto' },
  { id: 'despesas', label: 'Despesas' },
  { id: 'extrato', label: 'Extrato' },
];

export function FinanceiroWorkspace() {
  const [tab, setTab] = useState<FinanceiroTab>('dashboard');

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-white/10 bg-[#121724] p-4 sm:p-5">
        <h1 className="text-lg font-semibold text-zinc-100 sm:text-xl">Financeiro</h1>
        <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
          Contas a receber, despesas e extrato do período.
        </p>
        <nav className="mt-4 flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition sm:text-sm ${
                tab === t.id
                  ? 'border-blue-500/50 bg-blue-600/20 text-blue-300'
                  : 'border-white/10 bg-[#0d1320] text-zinc-400 hover:border-white/20 hover:text-zinc-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <section className="rounded-2xl border border-white/10 bg-[#121724] p-4 sm:p-5">
        {tab === 'dashboard' ? <FinanceiroDashboardTab /> : null}
        {tab === 'nfs' ? <FinanceiroNfsTab /> : null}
        {tab === 'despesas' ? <FinanceiroDespesasTab /> : null}
        {tab === 'extrato' ? <FinanceiroExtratoTab /> : null}
      </section>
    </div>
  );
}
