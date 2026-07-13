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
        <h3 className="text-sm font-medium text-gray-600">
          {title ?? 'Filtros operacionais'}
        </h3>
        <button
          type="button"
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 transition hover:border-gray-300 hover:bg-gray-100 hover:text-gray-700"
        >
          Limpar filtros
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {filters.map((filter) => (
          <label key={filter.label} className="space-y-1.5">
            <span className="text-xs text-gray-500">{filter.label}</span>
            <select className="w-full cursor-pointer rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/25">
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
