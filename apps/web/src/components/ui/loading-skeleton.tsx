type LoadingSkeletonProps = {
  lines?: number;
};

export function LoadingSkeleton({ lines = 4 }: LoadingSkeletonProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#121724] p-4">
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={index}
            className="h-4 animate-pulse rounded bg-zinc-700/50"
            style={{ width: `${100 - index * 8}%` }}
          />
        ))}
      </div>
    </div>
  );
}
