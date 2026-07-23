'use client';

import { Building2, ChevronDown } from 'lucide-react';
import {
  BUSINESS_CONTEXT_LABEL,
  BUSINESS_CONTEXTS,
  type BusinessContext,
} from '@/src/lib/business-context';
import { useBusinessContext } from '@/src/components/layout/business-context-provider';

export function BusinessContextSelector() {
  const { context, setContext } = useBusinessContext();

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Contexto operacional</span>
      <Building2
        className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[#2AACE2]"
        aria-hidden
      />
      <select
        value={context}
        onChange={(e) => setContext(e.target.value as BusinessContext)}
        className="erp-focus-ring appearance-none rounded-xl border border-white/10 bg-white/[0.08] py-2 pl-8 pr-8 text-xs font-semibold text-white transition hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] sm:text-[13px]"
        aria-label="Contexto WEG/SP ou Site/Londrina"
      >
        {BUSINESS_CONTEXTS.map((value) => (
          <option key={value} value={value} className="bg-[#0b1c2c] text-white">
            {BUSINESS_CONTEXT_LABEL[value]}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-white/70"
        aria-hidden
      />
    </label>
  );
}
