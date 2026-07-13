'use client';

import {
  BarChart3,
  ClipboardList,
  LayoutGrid,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type CrmView = 'dashboard' | 'kanban' | 'clientes' | 'relatorios';

type NavItem = {
  id: CrmView;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'kanban', label: 'Kanban', icon: LayoutGrid },
  { id: 'clientes', label: 'Clientes', icon: Users },
  { id: 'relatorios', label: 'Relatórios', icon: ClipboardList },
];

export function CrmSidebar(props: {
  activeView: CrmView;
  onViewChange: (view: CrmView) => void;
  onOpenSettings: () => void;
}) {
  return (
    <aside className="hidden w-[220px] shrink-0 flex-col border-r border-white/10 bg-[#0f172a] md:flex">
      <div className="border-b border-white/10 px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
          CRM
        </p>
        <h1 className="mt-1 text-base font-semibold text-white">Funil comercial</h1>
      </div>

      <nav className="flex-1 space-y-0.5 p-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = props.activeView === item.id;

          if (item.disabled) {
            return (
              <div
                key={item.id}
                className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/35"
                title="Em breve"
              >
                <Icon className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
                <span>{item.label}</span>
                <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
                  Em breve
                </span>
              </div>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => props.onViewChange(item.id)}
              className={`erp-focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                active
                  ? 'bg-[#2AACE2] text-white shadow-[inset_3px_0_0_0_#5BBFB0]'
                  : 'text-white/75 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${active ? 'text-white' : ''}`}
                aria-hidden
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-2">
        <button
          type="button"
          onClick={props.onOpenSettings}
          className="erp-focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-white/75 transition hover:bg-white/10 hover:text-white"
          title="Configurações"
        >
          <Settings className="h-4 w-4 shrink-0" aria-hidden />
          <span>Configurações</span>
        </button>
      </div>
    </aside>
  );
}

/** Navegação do CRM em lista, usada no drawer mobile. */
export function CrmMobileNav(props: {
  activeView: CrmView;
  onViewChange: (view: CrmView) => void;
  onOpenSettings: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = props.activeView === item.id;
        return (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            onClick={() => props.onViewChange(item.id)}
            className={`erp-focus-ring flex min-h-[48px] w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition disabled:opacity-40 ${
              active
                ? 'bg-[#2AACE2] text-white'
                : 'text-[var(--erp-fg)] hover:bg-[var(--erp-bg-hover)]'
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden />
            <span>{item.label}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={props.onOpenSettings}
        className="erp-focus-ring flex min-h-[48px] w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-[var(--erp-fg)] transition hover:bg-[var(--erp-bg-hover)]"
      >
        <Settings className="h-5 w-5 shrink-0" aria-hidden />
        <span>Configurações</span>
      </button>
    </nav>
  );
}
