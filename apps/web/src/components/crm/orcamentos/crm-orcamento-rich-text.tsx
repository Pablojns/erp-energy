'use client';

import { useEffect, useRef } from 'react';
import { Bold, Italic, Underline } from 'lucide-react';

export function CrmOrcamentoRichText(props: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.innerHTML !== (props.value || '')) {
      el.innerHTML = props.value || '';
    }
  }, [props.value]);

  const apply = (command: string) => {
    if (props.disabled) return;
    ref.current?.focus();
    document.execCommand(command, false);
    props.onChange(ref.current?.innerHTML ?? '');
  };

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--erp-border)] bg-white">
      <div className="flex items-center gap-1 border-b border-[var(--erp-border)] bg-[var(--erp-bg)] px-2 py-1.5">
        <button
          type="button"
          className="erp-focus-ring rounded p-1.5 text-[var(--erp-fg-muted)] hover:bg-white hover:text-[var(--erp-fg)]"
          onClick={() => apply('bold')}
          disabled={props.disabled}
          title="Negrito"
          aria-label="Negrito"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="erp-focus-ring rounded p-1.5 text-[var(--erp-fg-muted)] hover:bg-white hover:text-[var(--erp-fg)]"
          onClick={() => apply('italic')}
          disabled={props.disabled}
          title="Itálico"
          aria-label="Itálico"
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="erp-focus-ring rounded p-1.5 text-[var(--erp-fg-muted)] hover:bg-white hover:text-[var(--erp-fg)]"
          onClick={() => apply('underline')}
          disabled={props.disabled}
          title="Sublinhado"
          aria-label="Sublinhado"
        >
          <Underline className="h-4 w-4" />
        </button>
      </div>
      <div
        ref={ref}
        contentEditable={!props.disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        data-placeholder={props.placeholder ?? ''}
        className="min-h-[7rem] px-3 py-2 text-sm text-[var(--erp-fg)] outline-none empty:before:pointer-events-none empty:before:text-[var(--erp-fg-muted)] empty:before:content-[attr(data-placeholder)]"
        onInput={() => props.onChange(ref.current?.innerHTML ?? '')}
      />
    </div>
  );
}
