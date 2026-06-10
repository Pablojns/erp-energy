'use client';

import { CalendarDays, Filter, Plus } from 'lucide-react';
import { GlowButton } from '@/src/components/shell/glow-button';
import { GlassCard } from '@/src/components/shell/glass-card';

export function FilterBar() {
  return (
    <GlassCard
      glow="none"
      className="flex flex-wrap items-center gap-3 border-white/[0.1] bg-[rgba(8,11,20,0.65)] p-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] sm:gap-3.5 sm:p-4"
    >
      <label className="flex min-w-[140px] flex-1 items-center gap-2.5 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] ring-1 ring-transparent backdrop-blur-md transition focus-within:border-sky-400/40 focus-within:ring-sky-400/25">
        <CalendarDays className="h-4 w-4 shrink-0 text-sky-400/80" strokeWidth={1.75} />
        <select className="w-full cursor-pointer bg-transparent text-sm font-medium text-zinc-100 outline-none">
          <option>Hoje</option>
          <option>Últimos 7 dias</option>
          <option>Este mês</option>
        </select>
      </label>

      <GlowButton variant="secondary" className="gap-2 px-4 py-2.5">
        <Filter className="h-4 w-4 text-sky-300/90" strokeWidth={1.75} />
        Filtros avançados
      </GlowButton>

      <GlowButton
        variant="primary"
        className="ml-auto gap-2 px-5 py-2.5 font-semibold shadow-lg"
      >
        <Plus className="h-4 w-4" strokeWidth={2.25} />
        Ação rápida
      </GlowButton>
    </GlassCard>
  );
}
