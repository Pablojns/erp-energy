import { GlassCard } from '@/src/components/shell/glass-card';

type FilterOption = {
  label: string;
  value: string;
};

type AdvancedFiltersProps = {
  title?: string;
  filters: Array<{
    label: string;
    options: FilterOption[];
  }>;
};

export function AdvancedFilters({ title, filters }: AdvancedFiltersProps) {
  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-300">
          {title ?? 'Filtros operacionais'}
        </h3>
        <button
          type="button"
          className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs text-zinc-400 transition hover:border-white/[0.18] hover:bg-white/[0.05] hover:text-zinc-200"
        >
          Limpar filtros
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {filters.map((filter) => (
          <label key={filter.label} className="space-y-1.5">
            <span className="text-xs text-zinc-500">{filter.label}</span>
            <select className="w-full cursor-pointer rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/25">
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </GlassCard>
  );
}
