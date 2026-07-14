'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type MobileBottomDrawerProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** z-index layer — default 70 */
  zIndex?: number;
};

export function MobileBottomDrawer(props: MobileBottomDrawerProps) {
  const { open, onClose, title, children, zIndex = 70 } = props;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="erp-mobile-drawer-root bottom-sheet" style={{ zIndex }}>
      <button
        type="button"
        className="erp-mobile-drawer-backdrop"
        aria-label="Fechar"
        onClick={onClose}
      />
      <aside
        className="erp-mobile-drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title ?? 'Painel'}
      >
        <div className="erp-mobile-drawer-handle" aria-hidden />
        {title ? (
          <div className="erp-mobile-drawer-head bottom-sheet-header">
            <h3 className="erp-mobile-drawer-title">{title}</h3>
            <button
              type="button"
              className="erp-mobile-touch-target"
              onClick={onClose}
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : null}
        <div className="erp-mobile-drawer-body bottom-sheet-content">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
