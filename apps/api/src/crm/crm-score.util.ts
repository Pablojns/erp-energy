import type { Prisma } from '@erp/database';

type ScoreInput = {
  phone: string | null;
  email: string | null;
  value: Prisma.Decimal | number | null;
  touchPoints: number;
  lastTouchpointAt: string | Date;
};

export function computeCrmLeadScore(input: ScoreInput): number {
  let score = 0;

  if (input.phone?.trim()) score += 1;
  if (input.email?.trim()) score += 1;

  const numericValue =
    input.value != null
      ? typeof input.value === 'number'
        ? input.value
        : Number(input.value)
      : 0;
  if (Number.isFinite(numericValue) && numericValue > 0) score += 1;

  score += Math.min(Math.max(input.touchPoints, 0), 4);

  const lastAt =
    input.lastTouchpointAt instanceof Date
      ? input.lastTouchpointAt
      : new Date(input.lastTouchpointAt);
  const daysSinceContact =
    (Date.now() - lastAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceContact < 3) score += 2;
  else if (daysSinceContact < 7) score += 1;

  if (Number.isFinite(numericValue) && numericValue > 1000) score += 1;

  return Math.min(score, 10);
}

export function normalizeCrmPhone(phone?: string | null): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}

export function normalizeCrmEmail(email?: string | null): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}
