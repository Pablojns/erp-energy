import type { ReactNode } from 'react';

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-gradient-to-r from-[var(--erp-bg-muted)] via-[color-mix(in_srgb,var(--erp-fg)_8%,var(--erp-bg-muted))] to-[var(--erp-bg-muted)] ${className}`}
      aria-hidden
    />
  );
}

export function CardGridSkeleton(props: { count?: number; className?: string }) {
  const count = props.count ?? 8;
  return (
    <div
      className={`grid w-full grid-cols-1 gap-1.5 lg:grid-cols-3 2xl:grid-cols-4 ${props.className ?? ''}`}
      aria-busy="true"
      aria-label="Carregando conteúdo"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="space-y-2 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-bg-muted)]/40 p-3"
        >
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton(props: { rows?: number; className?: string }) {
  const rows = props.rows ?? 6;
  return (
    <div className={`space-y-2 ${props.className ?? ''}`} aria-busy="true" aria-label="Carregando lista">
      {Array.from({ length: rows }).map((_, idx) => (
        <Skeleton key={idx} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function TableSkeleton(props: {
  rows?: number;
  columns?: number;
  className?: string;
  header?: boolean;
}) {
  const rows = props.rows ?? 5;
  const columns = props.columns ?? 5;
  return (
    <div className={`overflow-hidden ${props.className ?? ''}`} aria-busy="true" aria-label="Carregando tabela">
      {props.header !== false ? (
        <div className="mb-2 grid gap-2 border-b border-[var(--erp-border)] pb-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((_, idx) => (
            <Skeleton key={idx} className="h-3 w-full" />
          ))}
        </div>
      ) : null}
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div
            key={rowIdx}
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((_, colIdx) => (
              <Skeleton key={colIdx} className="h-10 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MetricCardsSkeleton(props: { count?: number; className?: string }) {
  const count = props.count ?? 6;
  return (
    <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${props.className ?? ''}`} aria-busy="true">
      {Array.from({ length: count }).map((_, idx) => (
        <Skeleton key={idx} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function InlineLoadMoreSkeleton(props: { label?: ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-2 py-3">
      <Skeleton className="h-4 w-4 rounded-full" />
      <Skeleton className="h-3 w-36" />
      {props.label ? <span className="sr-only">{props.label}</span> : null}
    </div>
  );
}
