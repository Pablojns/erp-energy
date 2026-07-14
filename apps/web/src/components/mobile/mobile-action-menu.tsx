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

  if (actions.length === 0) return null;

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
        <div className="bottom-sheet-content flex flex-col gap-2">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={action.disabled}
              className={`erp-mobile-action-item${action.destructive ? ' erp-mobile-action-item--danger' : ''}`}
              onClick={() => {
                if (action.disabled) return;
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
