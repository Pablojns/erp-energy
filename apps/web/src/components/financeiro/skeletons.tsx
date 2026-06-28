export function FinMetricSkeleton() {
  return (
    <div className="fin-card rounded-2xl p-4 sm:p-5">
      <div className="fin-skeleton h-3 w-24 rounded-md" />
      <div className="fin-skeleton mt-3 h-8 w-36 rounded-lg" />
      <div className="fin-skeleton mt-2 h-3 w-20 rounded-md" />
    </div>
  );
}

export function FinChartSkeleton() {
  return (
    <div className="fin-card rounded-2xl p-4 sm:p-5">
      <div className="fin-skeleton h-4 w-48 rounded-md" />
      <div className="fin-skeleton mt-6 h-[220px] w-full rounded-xl" />
    </div>
  );
}

export function FinTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="fin-card overflow-hidden rounded-2xl">
      <div className="border-b px-4 py-3" style={{ borderColor: 'var(--fin-border)' }}>
        <div className="fin-skeleton h-4 w-40 rounded-md" />
      </div>
      <div className="space-y-0 p-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b px-2 py-3 last:border-b-0"
            style={{ borderColor: 'var(--fin-border)' }}
          >
            <div className="fin-skeleton h-4 flex-1 rounded-md" />
            <div className="fin-skeleton h-4 w-20 rounded-md" />
            <div className="fin-skeleton h-4 w-16 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinPieSkeleton() {
  return (
    <div className="fin-card flex flex-col items-center rounded-2xl p-5">
      <div className="fin-skeleton h-4 w-40 rounded-md" />
      <div className="fin-skeleton mt-6 h-40 w-40 rounded-full" />
      <div className="mt-6 w-full space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="fin-skeleton h-3 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}

export function FinTimelineSkeleton() {
  return (
    <div className="fin-card overflow-hidden rounded-2xl">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex gap-3 border-b px-4 py-4"
          style={{ borderColor: 'var(--fin-border)' }}
        >
          <div className="fin-skeleton h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="fin-skeleton h-4 w-2/3 rounded-md" />
            <div className="fin-skeleton h-3 w-1/3 rounded-md" />
          </div>
          <div className="fin-skeleton h-5 w-24 rounded-md" />
        </div>
      ))}
    </div>
  );
}
