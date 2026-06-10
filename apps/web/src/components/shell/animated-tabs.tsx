'use client';

type Tab = { id: string; label: string };

type AnimatedTabsProps = {
  tabs: Tab[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
};

/**
 * Tabs com sublinhado animado — base para filtros internos por módulo.
 */
export function AnimatedTabs({
  tabs,
  activeId,
  onChange,
  className = '',
}: AnimatedTabsProps) {
  return (
    <div className={`erp-tabs-shell ${className}`} role="tablist">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active ? 'true' : 'false'}
            onClick={() => onChange(tab.id)}
            className="erp-tab-btn"
          >
            <span className="relative z-10">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
