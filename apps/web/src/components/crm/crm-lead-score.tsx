'use client';

export function scoreThermometerColor(score: number): string {
  if (score <= 3) return 'bg-rose-500';
  if (score <= 6) return 'bg-amber-400';
  return 'bg-emerald-500';
}

export function CrmLeadScoreThermometer(props: {
  score: number;
  compact?: boolean;
  showLabel?: boolean;
  prominent?: boolean;
}) {
  const { score, compact = false, showLabel = true, prominent = false } = props;
  const pct = Math.max(0, Math.min(100, (score / 10) * 100));
  const color = scoreThermometerColor(score);
  const barHeight = prominent ? 'h-3' : compact ? 'h-2' : 'h-2.5';

  return (
    <div className={prominent ? 'w-full' : compact ? 'min-w-[5rem]' : 'min-w-[5.5rem]'}>
      {showLabel ? (
        <div
          className={`mb-1 flex items-center justify-between gap-2 text-[var(--erp-fg-muted)] ${
            prominent ? 'text-xs' : 'text-[10px]'
          }`}
        >
          <span className="font-medium">Score</span>
          <span className="font-bold text-[var(--erp-fg)]">{score}/10</span>
        </div>
      ) : null}
      <div
        className={`overflow-hidden rounded-full bg-white/15 ${barHeight}`}
        role="meter"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={10}
        aria-label={`Score do lead: ${score} de 10`}
      >
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
