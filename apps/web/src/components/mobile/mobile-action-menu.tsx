'use client';

import { useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { MobileBottomDrawer } from '@/src/components/mobile/mobile-bottom-drawer';

export type MobileActionItem = {
  id: string;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

export function MobileActionMenu(props: {
  actions: MobileActionItem[];
  ariaLabel?: string;
}) {
  const { actions, ariaLabel = 'Ações' } = props;
  const [open, setOpen] = useState(false);
  const visible = actions.filter((a) => !a.disabled);

  if (visible.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className="erp-mobile-touch-target erp-mobile-action-trigger md:hidden"
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
      >
        <MoreVertical className="h-5 w-5" />
      </button>
      <MobileBottomDrawer open={open} onClose={() => setOpen(false)} title="Ações">
        <div className="grid gap-1">
          {visible.map((action) => (
            <button
              key={action.id}
              type="button"
              className={`erp-mobile-action-item${action.destructive ? ' erp-mobile-action-item--danger' : ''}`}
              onClick={() => {
                setOpen(false);
                action.onClick();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </MobileBottomDrawer>
    </>
  );
}
