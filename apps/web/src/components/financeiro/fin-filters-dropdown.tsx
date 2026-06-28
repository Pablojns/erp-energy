'use client';



import { Filter } from 'lucide-react';

import { useEffect, useRef, useState, type ReactNode } from 'react';



export function FinFiltersDropdown(props: {

  activeCount: number;

  title?: string;

  onClear?: () => void;

  searchSlot?: ReactNode;

  children: ReactNode;

}) {

  const { activeCount, title = 'Filtros', onClear, searchSlot, children } = props;

  const [open, setOpen] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);



  useEffect(() => {

    if (!open) return;

    const onDoc = (e: MouseEvent) => {

      if (!wrapRef.current?.contains(e.target as Node)) {

        setOpen(false);

      }

    };

    document.addEventListener('mousedown', onDoc);

    return () => document.removeEventListener('mousedown', onDoc);

  }, [open]);



  return (

    <div className="fin-filter-toolbar">

      {searchSlot ? <div className="fin-filter-search">{searchSlot}</div> : null}

      <div className="fin-filter-btn-wrap">

        <div className="erp-filter-bar !mt-0">

          <div className="erp-filter-bar-controls" ref={wrapRef}>

            <button

              type="button"

              className={`erp-filter-bar-btn shrink-0 ${open ? 'erp-filter-bar-btn--open' : ''}`}

              onClick={() => setOpen((v) => !v)}

              aria-expanded={open}

            >

              <Filter className="h-4 w-4" aria-hidden />

              Filtros

              {activeCount > 0 ? (

                <span className="erp-filter-bar-count">{activeCount}</span>

              ) : null}

            </button>



            {open ? (

              <div className="erp-filter-panel absolute right-0 top-full z-50 mt-1 max-h-[80vh] overflow-y-auto">

                <div className="erp-filter-panel-head">

                  <h4>{title}</h4>

                </div>

                <div className="erp-filter-panel-body">{children}</div>

                {onClear && activeCount > 0 ? (

                  <div className="erp-filter-panel-foot">

                    <button

                      type="button"

                      className="erp-filter-clear-btn"

                      onClick={() => {

                        onClear();

                        setOpen(false);

                      }}

                    >

                      Limpar filtros

                    </button>

                  </div>

                ) : null}

              </div>

            ) : null}

          </div>

        </div>

      </div>

    </div>

  );

}



const optionBtnClass = (active: boolean) =>

  `rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${

    active

      ? 'border-[var(--fin-accent)] bg-[var(--fin-accent-soft)] text-[var(--fin-accent)]'

      : 'border-[var(--fin-border)] bg-[var(--fin-card-muted)] text-[var(--fin-text-secondary)] hover:border-[var(--fin-border-strong)] hover:text-[var(--fin-text)]'

  }`;



export function FinFilterOptionGroup(props: {

  label: string;

  children: ReactNode;

}) {

  return (

    <div className="space-y-2">

      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--fin-text-muted)]">

        {props.label}

      </p>

      <div className="flex flex-wrap gap-1.5">{props.children}</div>

    </div>

  );

}



export function FinFilterOptionButton(props: {

  active: boolean;

  onClick: () => void;

  children: ReactNode;

}) {

  const { active, onClick, children } = props;

  return (

    <button type="button" className={optionBtnClass(active)} onClick={onClick}>

      {children}

    </button>

  );

}



export function FinFilterFieldLabel(props: {

  label: string;

  children: ReactNode;

}) {

  return (

    <label className="block space-y-1.5 text-xs text-[var(--fin-text-secondary)]">

      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--fin-text-muted)]">

        {props.label}

      </span>

      {props.children}

    </label>

  );

}


