import { Prisma } from '@erp/database';

export type QuoteItemEngravingEntry = {
  engravingTechniqueId: string | null;
  engraving: string | null;
  engravingPrice: number | null;
};

export function parseQuoteItemEngravings(
  raw: unknown,
  legacy?: {
    engravingTechniqueId?: string | null;
    engraving?: string | null;
    engravingPrice?: Prisma.Decimal | number | string | null;
  },
): QuoteItemEngravingEntry[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const r = row as Record<string, unknown>;
        const priceRaw = r.engravingPrice;
        let engravingPrice: number | null = null;
        if (priceRaw != null && priceRaw !== '') {
          const n = Number(priceRaw);
          engravingPrice = Number.isFinite(n) ? n : null;
        }
        const techniqueId =
          typeof r.engravingTechniqueId === 'string' && r.engravingTechniqueId.trim()
            ? r.engravingTechniqueId.trim()
            : null;
        const name =
          typeof r.engraving === 'string' && r.engraving.trim()
            ? r.engraving.trim()
            : null;
        if (!techniqueId && !name && (engravingPrice == null || engravingPrice <= 0)) {
          return null;
        }
        return {
          engravingTechniqueId: techniqueId,
          engraving: name,
          engravingPrice,
        } satisfies QuoteItemEngravingEntry;
      })
      .filter((x): x is QuoteItemEngravingEntry => Boolean(x));
  }

  if (
    legacy &&
    (legacy.engravingTechniqueId ||
      legacy.engraving ||
      (legacy.engravingPrice != null && Number(legacy.engravingPrice) > 0))
  ) {
    const n =
      legacy.engravingPrice == null ? null : Number(legacy.engravingPrice);
    return [
      {
        engravingTechniqueId: legacy.engravingTechniqueId?.trim() || null,
        engraving: legacy.engraving?.trim() || null,
        engravingPrice: n != null && Number.isFinite(n) ? n : null,
      },
    ];
  }

  return [];
}

export function syncLegacyEngravingFields(entries: QuoteItemEngravingEntry[]): {
  engraving: string | null;
  engravingTechniqueId: string | null;
  engravingPrice: Prisma.Decimal | null;
  engravings: QuoteItemEngravingEntry[] | null;
} {
  const cleaned = entries.filter(
    (e) =>
      Boolean(e.engravingTechniqueId) ||
      Boolean(e.engraving?.trim()) ||
      (e.engravingPrice != null && e.engravingPrice > 0),
  );
  if (cleaned.length === 0) {
    return {
      engraving: null,
      engravingTechniqueId: null,
      engravingPrice: null,
      engravings: null,
    };
  }

  const sum = cleaned.reduce((acc, e) => acc + (e.engravingPrice ?? 0), 0);
  const names = cleaned
    .map((e) => e.engraving?.trim())
    .filter((n): n is string => Boolean(n));
  const techniqueIds = [
    ...new Set(
      cleaned
        .map((e) => e.engravingTechniqueId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  return {
    engraving: names.length > 0 ? names.join(' + ') : null,
    engravingTechniqueId: techniqueIds.length === 1 ? techniqueIds[0]! : null,
    engravingPrice: new Prisma.Decimal(sum),
    engravings: cleaned,
  };
}
