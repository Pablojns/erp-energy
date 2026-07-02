'use client';

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import {
  computeVariationPct,
  formatCurrency,
  formatPercent,
} from '@/src/components/dashboard/utils';

type ComparisonBannerProps = {
  currentMonth: number;
  previousMonth: number;
  currentLabel?: string;
  previousLabel?: string;
};

export function ComparisonBanner({
  currentMonth,
  previousMonth,
  currentLabel = 'Período selecionado',
  previousLabel = 'Período anterior',
}: ComparisonBannerProps) {
  const variation = computeVariationPct(currentMonth, previousMonth);
  const isUp = variation > 0;
  const isDown = variation < 0;

  return (
    <div className="dash-comparison-banner w-full">
      <div className="dash-comparison-item">
        <span className="dash-comparison-label">{currentLabel}</span>
        <span className="dash-comparison-value">{formatCurrency(currentMonth)}</span>
      </div>
      <div className="hidden h-8 w-px bg-[var(--dash-border)] sm:block" aria-hidden />
      <div className="dash-comparison-item">
        <span className="dash-comparison-label">{previousLabel}</span>
        <span className="dash-comparison-value">{formatCurrency(previousMonth)}</span>
      </div>
      <div
        className={`dash-variation ${isUp ? 'dash-variation--up' : isDown ? 'dash-variation--down' : 'dash-variation--flat'}`}
      >
        {isUp ? (
          <ArrowUpRight size={16} />
        ) : isDown ? (
          <ArrowDownRight size={16} />
        ) : (
          <Minus size={16} />
        )}
        {formatPercent(Math.abs(variation))} vs período anterior
      </div>
    </div>
  );
}

export function ComparisonBannerSkeleton() {
  return (
    <div className="dash-comparison-banner w-full">
      <div className="dash-skeleton h-12 w-40" />
      <div className="dash-skeleton h-12 w-40" />
      <div className="dash-skeleton h-8 w-32 rounded-full" />
    </div>
  );
}

type PeriodCurrentBannerProps = {
  value: number;
  label?: string;
};

export function PeriodCurrentBanner({
  value,
  label = 'Período selecionado',
}: PeriodCurrentBannerProps) {
  return (
    <div className="dash-comparison-banner w-full">
      <div className="dash-comparison-item">
        <span className="dash-comparison-label">{label}</span>
        <span className="dash-comparison-value">{formatCurrency(value)}</span>
      </div>
    </div>
  );
}
