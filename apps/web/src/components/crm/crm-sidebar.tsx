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
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-[#1e2329] bg-[#2b3139]">
      <div className="border-b border-[#1e2329] px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8a9199]">
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
                className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[#5c636a]"
                title="Em breve"
              >
                <Icon className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
                <span>{item.label}</span>
                <span className="ml-auto rounded bg-[#1e2329] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
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
                  ? 'bg-[#3a424b] text-white shadow-[inset_3px_0_0_0_#2fc6f6]'
                  : 'text-[#b4bbc3] hover:bg-[#343b44] hover:text-white'
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${active ? 'text-[#2fc6f6]' : ''}`}
                aria-hidden
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-[#1e2329] p-2">
        <button
          type="button"
          onClick={props.onOpenSettings}
          className="erp-focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#b4bbc3] transition hover:bg-[#343b44] hover:text-white"
          title="Configurações"
        >
          <Settings className="h-4 w-4 shrink-0" aria-hidden />
          <span>Configurações</span>
        </button>
      </div>
    </aside>
  );
}
