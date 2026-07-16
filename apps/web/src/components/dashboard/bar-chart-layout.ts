export type BarChartLayoutOptions = {
  count: number;
  width?: number;
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  maxBarWidth?: number;
  minBarWidth?: number;
  /** Largura fixa por coluna — evita barras grossas e libera scroll horizontal. */
  fixedSlotWidth?: number;
};

export type BarSlot = {
  index: number;
  x: number;
  barW: number;
  centerX: number;
  baselineY: number;
  innerH: number;
  labelY: number;
};

export function buildBarChartLayout(opts: BarChartLayoutOptions) {
  const height = opts.height ?? 280;
  const margin = opts.margin ?? { top: 24, right: 16, bottom: 44, left: 60 };
  const count = Math.max(opts.count, 1);
  const innerH = height - margin.top - margin.bottom;
  const baselineY = margin.top + innerH;
  const labelY = height - Math.max(8, Math.floor(margin.bottom * 0.35));

  const maxBarW = opts.maxBarWidth ?? 18;
  const minBarW = opts.minBarWidth ?? 6;
  const barFillRatio = 0.36;

  let width: number;
  let innerW: number;
  let slotW: number;
  let barW: number;

  if (opts.fixedSlotWidth && opts.fixedSlotWidth > 0) {
    slotW = opts.fixedSlotWidth;
    innerW = slotW * count;
    width = margin.left + innerW + margin.right;
    barW = Math.min(maxBarW, Math.max(minBarW, slotW * barFillRatio));
  } else {
    width = opts.width ?? 800;
    innerW = width - margin.left - margin.right;
    slotW = innerW / count;
    barW = Math.min(maxBarW, Math.max(minBarW, slotW * barFillRatio));
  }

  const slots: BarSlot[] = Array.from({ length: count }, (_, i) => {
    const x = margin.left + i * slotW + (slotW - barW) / 2;
    return {
      index: i,
      x,
      barW,
      centerX: margin.left + i * slotW + slotW / 2,
      baselineY,
      innerH,
      labelY,
    };
  });

  return { width, height, margin, innerW, innerH, barW, slotW, baselineY, labelY, slots };
}

export function barHeight(value: number, max: number, innerH: number): number {
  const v = Math.max(0, Number(value) || 0);
  if (v <= 0) return 0;
  const safeMax = Math.max(max, v, 1);
  const ratio = v / safeMax;
  return Math.max(4, ratio * innerH);
}

/** Máximo dos valores para escala relativa (maior barra = 100% da altura). */
export function chartDataMax(values: number[]): number {
  return Math.max(...values, 0);
}

/** Escala Y “arredondada” para as barras ocuparem melhor a altura útil. */
export function niceYMax(dataMax: number): number {
  const v = Math.max(dataMax, 1);
  const padded = v * 1.05;
  const exp = Math.floor(Math.log10(padded));
  const pow = Math.pow(10, Math.max(0, exp));
  const n = padded / pow;
  let nice: number;
  if (n <= 1) nice = 1;
  else if (n <= 2) nice = 2;
  else if (n <= 2.5) nice = 2.5;
  else if (n <= 5) nice = 5;
  else nice = 10;
  return nice * pow;
}

export function yMaxFromValues(values: number[]): number {
  return niceYMax(Math.max(...values, 0));
}

export function formatCompactCurrency(value: number): string {
  const v = Math.max(0, Number(value) || 0);
  if (v >= 1_000_000) {
    return `R$ ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(v / 1_000_000)}M`;
  }
  if (v >= 10_000) {
    return `R$ ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(v / 1_000)}k`;
  }
  if (v >= 1_000) {
    return `R$ ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(v / 1_000)}k`;
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(v);
}

export function formatAxisMonthLabel(label: string): string {
  const clean = label.replace(/\./g, '').trim();
  if (!clean) return label;
  return clean.charAt(0).toUpperCase() + clean.slice(1, 3);
}

export function shouldShowXLabel(index: number, total: number): boolean {
  if (total <= 12) return true;
  if (total <= 18) return index % 2 === 0 || index === total - 1;
  return index % Math.ceil(total / 10) === 0 || index === total - 1;
}
