'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { CrmOrcamentoCatalogPickerModal } from '@/src/components/crm/orcamentos/crm-orcamento-catalog-picker';
import { CrmOrcamentoProductImage } from '@/src/components/crm/orcamentos/crm-orcamento-product-image';
import {
  addQuoteItem,
  deleteQuoteItem,
  formatQuoteCurrency,
  listEngravingTechniques,
  listQuoteCatalogEngravingOptions,
  updateQuoteItem,
  type EngravingTechniqueDto,
  type QuoteCatalogEngravingOptionDto,
  type QuoteCatalogProductDto,
  type QuoteDto,
  type QuoteItemDto,
  type UpdateQuoteItemPayload,
} from '@/src/services/api/quotes-api';

function calcEngravingFromTiers(
  technique: EngravingTechniqueDto | undefined,
  quantity: number,
): number | null {
  if (!technique?.tiers?.length) return null;
  const qty = Math.max(1, Math.floor(quantity) || 1);
  const tier = technique.tiers.find((t) => qty >= t.qtyFrom && qty <= t.qtyTo);
  if (!tier) return null;
  const cost = Number(String(tier.cost).replace(',', '.')) || 0;
  const fixedFee = Number(String(tier.fixedFee).replace(',', '.')) || 0;
  const applicationCost =
    Number(String(tier.applicationCost).replace(',', '.')) || 0;
  const isInterval = /intervalo/i.test(tier.costType || '');
  const base = isInterval ? cost / qty : cost;
  return Math.max(0, base + applicationCost + fixedFee / qty);
}

/** Preço unitário SPOT a partir das faixas MinQt/Price do catálogo. */
function calcSpotEngravingFromTiers(
  option: QuoteCatalogEngravingOptionDto | undefined,
  quantity: number,
): number | null {
  if (!option) return null;
  const qty = Math.max(1, Math.floor(quantity) || 1);
  const tiers = option.tiers ?? [];
  if (tiers.length > 0) {
    const tier = tiers.find((t) => qty >= t.qtyFrom && qty <= t.qtyTo);
    if (!tier) return null;
    const price = Number(String(tier.price).replace(',', '.'));
    return Number.isFinite(price) ? Math.max(0, price) : null;
  }
  if (option.price == null) return null;
  const fallback = Number(String(option.price).replace(',', '.'));
  return Number.isFinite(fallback) ? Math.max(0, fallback) : null;
}

function spotEngravingMinQty(
  option: QuoteCatalogEngravingOptionDto | undefined,
): number | null {
  if (!option) return null;
  if (option.minQty != null && option.minQty > 0) return option.minQty;
  const first = option.tiers?.[0]?.qtyFrom;
  return first != null && first > 0 ? first : null;
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function qtyTotal(unit: number, quantity: number) {
  return round2(Math.max(0, unit) * Math.max(0, quantity));
}

const DEFAULT_SALES_MARGIN_PERCENT = 40;

/**
 * Margem por dentro (sem arredondar intermediários).
 * Forma estável que preserva rateio mínimo de Difal/outros:
 * (produto*qtd + grav*qtd + difal + outros) / (qtd * (1 - totalPercent/100))
 */
function calcFinalUnitPricePrecise(
  productPrice: number,
  engravingPrice: number,
  commissionPercent: number,
  marginReservePercent: number,
  salesMarginPercent: number,
  quantity: number,
  difalValue: number,
  otherExtraCosts: number,
) {
  const qty =
    Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
  const pp = Math.max(0, productPrice);
  const eng = Math.max(0, engravingPrice);
  const difal = Math.max(0, difalValue);
  const other = Math.max(0, otherExtraCosts);
  const totalPercent =
    Math.max(0, commissionPercent) +
    Math.max(0, marginReservePercent) +
    Math.max(0, salesMarginPercent);
  const denom = 1 - totalPercent / 100;
  const numerator = pp * qty + eng * qty + difal + other;
  if (denom <= 0) return numerator / qty;
  return numerator / (qty * denom);
}

function inferSalesMarginPercent(
  quote: QuoteDto,
  commissionPercent: number,
  marginReservePercent: number,
): number {
  if (quote.salesMarginPercent != null && quote.salesMarginPercent !== '') {
    const n = Number(String(quote.salesMarginPercent).replace(',', '.'));
    // 0% explícito só é aceito se veio do formulário/API; ainda assim
    // se o unitário estiver igual ao custo bruto, cai no default abaixo.
    if (Number.isFinite(n) && n > 0) return n;
  }
  const difal = Number(String(quote.difalValue ?? '0').replace(',', '.')) || 0;
  const other =
    Number(String(quote.otherExtraCosts ?? '0').replace(',', '.')) || 0;
  for (const item of quote.items ?? []) {
    const product = Number(item.productPrice);
    if (item.productPrice == null || !Number.isFinite(product)) continue;
    const engraving = Number(item.engravingPrice ?? 0) || 0;
    const unit = Number(item.unitPrice) || 0;
    const qty = item.quantity > 0 ? item.quantity : 1;
    const extrasPerUnit = (difal + other) / qty;
    const custoBase =
      Math.max(0, product) + Math.max(0, engraving) + extrasPerUnit;
    if (custoBase <= 0 || unit <= 0) continue;
    // Unitário ≈ custo bruto → preço ainda sem margem embutida
    if (unit <= custoBase + 0.009) continue;
    const totalPercent = (1 - custoBase / unit) * 100;
    const salesPct = totalPercent - commissionPercent - marginReservePercent;
    if (Number.isFinite(salesPct) && salesPct > 0.5) {
      return Math.round(salesPct * 10000) / 10000;
    }
  }
  return DEFAULT_SALES_MARGIN_PERCENT;
}

function itemCustoBase(
  productPrice: number,
  engravingPrice: number,
  quantity: number,
  difalValue: number,
  otherExtraCosts: number,
) {
  const qty =
    Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
  return (
    Math.max(0, productPrice) +
    Math.max(0, engravingPrice) +
    Math.max(0, difalValue) / qty +
    Math.max(0, otherExtraCosts) / qty
  );
}

function readFileAsBase64(file: File): Promise<{
  base64: string;
  mimeType: string;
  fileName: string;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      return resolve({
        base64,
        mimeType: file.type || 'application/octet-stream',
        fileName: file.name,
      });
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo de arte.'));
    reader.readAsDataURL(file);
  });
}

export function CrmOrcamentoProductsSection(props: {
  quote: QuoteDto;
  onQuoteChange: (quote: QuoteDto) => void;
  onError: (message: string | null) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [techniques, setTechniques] = useState<EngravingTechniqueDto[]>([]);
  /** Opções SPOT por SKU (QuoteCatalogEngravingOption). */
  const [spotOptionsBySku, setSpotOptionsBySku] = useState<
    Record<string, QuoteCatalogEngravingOptionDto[]>
  >({});
  /** Rascunho do campo qtd enquanto digita (evita forçar 1 ao limpar). */
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [bulkQtyInput, setBulkQtyInput] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const items = props.quote.items ?? [];
  const commissionPercent =
    Number(String(props.quote.commissionPercent ?? '2').replace(',', '.')) || 0;
  const marginReservePercent =
    Number(String(props.quote.marginReservePercent ?? '6').replace(',', '.')) ||
    0;
  const salesMarginPercent = inferSalesMarginPercent(
    props.quote,
    commissionPercent,
    marginReservePercent,
  );
  const parseMoneyField = (raw: string | number | null | undefined) => {
    const n = Number(String(raw ?? '0').replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const difalValue = parseMoneyField(props.quote.difalValue);
  const otherExtraCosts = parseMoneyField(props.quote.otherExtraCosts);

  const finalUnit = (
    productPrice: number,
    engravingPrice: number,
    quantity: number,
  ) =>
    round2(
      calcFinalUnitPricePrecise(
        productPrice,
        engravingPrice,
        commissionPercent,
        marginReservePercent,
        salesMarginPercent,
        quantity,
        difalValue,
        otherExtraCosts,
      ),
    );

  const finalUnitPrecise = (
    productPrice: number,
    engravingPrice: number,
    quantity: number,
  ) =>
    calcFinalUnitPricePrecise(
      productPrice,
      engravingPrice,
      commissionPercent,
      marginReservePercent,
      salesMarginPercent,
      quantity,
      difalValue,
      otherExtraCosts,
    );

  useEffect(() => {
    void listEngravingTechniques()
      .then((res) => setTechniques(res.data.filter((t) => t.active)))
      .catch(() => setTechniques([]));
  }, []);

  useEffect(() => {
    const skus = [
      ...new Set(
        items
          .filter((i) => i.supplier === 'SPOT' && i.sku?.trim())
          .map((i) => i.sku.trim()),
      ),
    ];
    if (skus.length === 0) return;
    let cancelled = false;
    void Promise.all(
      skus.map(async (sku) => {
        try {
          const opts = await listQuoteCatalogEngravingOptions(sku);
          return [sku, opts] as const;
        } catch {
          return [sku, [] as QuoteCatalogEngravingOptionDto[]] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setSpotOptionsBySku((prev) => {
        const next = { ...prev };
        for (const [sku, opts] of entries) next[sku] = opts;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // Só reage a mudanças de SKUs SPOT no orçamento
    // eslint-disable-next-line react-hooks/exhaustive-deps -- spotOptionsBySku é cache; evita loop
  }, [
    items
      .filter((i) => i.supplier === 'SPOT')
      .map((i) => i.sku)
      .join('|'),
  ]);

  const liveSubtotal = useMemo(
    () =>
      items.reduce((acc, item) => {
        const product = Number(item.productPrice);
        const hasProduct =
          item.productPrice != null && Number.isFinite(product);
        if (hasProduct) {
          const eng = Number(item.engravingPrice ?? 0) || 0;
          const unitRounded = round2(
            finalUnitPrecise(product, eng, item.quantity),
          );
          return acc + unitRounded * item.quantity;
        }
        const unitRounded = round2(Number(item.unitPrice) || 0);
        return acc + unitRounded * item.quantity;
      }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rates from quote
    [items, commissionPercent, marginReservePercent, salesMarginPercent, difalValue, otherExtraCosts],
  );

  const freight = props.quote.freightToConsult
    ? 0
    : Number(props.quote.freightValue ?? 0) || 0;
  // Difal/extras já embutidos; subtotal/total = soma direta dos totais dos itens
  const liveTotal = round2(
    liveSubtotal + (Number.isFinite(freight) ? freight : 0),
  );
  const liveSubtotalDisplay = round2(liveSubtotal);

  const custoTotalDisplay = useMemo(() => {
    const itemsCost = items.reduce((acc, item) => {
      const product = Number(item.productPrice);
      const hasProduct =
        item.productPrice != null && Number.isFinite(product);
      if (!hasProduct) return acc;
      const eng = Number(item.engravingPrice ?? 0) || 0;
      const qty = item.quantity > 0 ? item.quantity : 1;
      return (
        acc +
        itemCustoBase(product, eng, qty, difalValue, otherExtraCosts) * qty
      );
    }, 0);
    return round2(itemsCost);
  }, [items, difalValue, otherExtraCosts]);

  const patchLocalItem = (itemId: string, patch: Partial<QuoteItemDto>) => {
    const nextItems = items.map((item) => {
      if (item.id !== itemId) return item;
      const quantity = patch.quantity ?? item.quantity;
      const product =
        patch.productPrice !== undefined
          ? Number(patch.productPrice)
          : Number(item.productPrice);
      const eng =
        patch.engravingPrice !== undefined
          ? Number(patch.engravingPrice ?? 0)
          : Number(item.engravingPrice ?? 0);
      const hasProduct =
        (patch.productPrice !== undefined
          ? patch.productPrice
          : item.productPrice) != null && Number.isFinite(product);
      const explicitUnitOnly =
        patch.unitPrice !== undefined &&
        patch.productPrice === undefined &&
        patch.engravingPrice === undefined &&
        patch.quantity === undefined;
      let unitPrecise: number;
      if (explicitUnitOnly) {
        unitPrecise = Number(patch.unitPrice) || 0;
      } else if (hasProduct) {
        unitPrecise = finalUnitPrecise(product || 0, eng || 0, quantity);
      } else {
        unitPrecise = Number(patch.unitPrice ?? item.unitPrice) || 0;
      }
      const unitRounded = round2(unitPrecise);
      const lineTotal = unitRounded * quantity;
      return {
        ...item,
        ...patch,
        quantity,
        unitPrice: String(unitRounded),
        total: String(round2(lineTotal)),
      };
    });
    const subtotalPrecise = nextItems.reduce((s, i) => {
      const p = Number(i.productPrice);
      if (i.productPrice != null && Number.isFinite(p)) {
        const unitRounded = round2(
          finalUnitPrecise(p, Number(i.engravingPrice ?? 0) || 0, i.quantity),
        );
        return s + unitRounded * i.quantity;
      }
      return s + round2(Number(i.unitPrice) || 0) * i.quantity;
    }, 0);
    const freightLocal = props.quote.freightToConsult
      ? 0
      : Number(props.quote.freightValue ?? 0) || 0;
    props.onQuoteChange({
      ...props.quote,
      items: nextItems,
      subtotal: String(round2(subtotalPrecise)),
      total: String(round2(subtotalPrecise + freightLocal)),
    });
  };

  const persistItem = async (
    itemId: string,
    payload: UpdateQuoteItemPayload,
  ) => {
    setBusyId(itemId);
    props.onError(null);
    try {
      const updated = await updateQuoteItem(props.quote.id, itemId, payload);
      props.onQuoteChange(updated);
    } catch (err) {
      props.onError(
        err instanceof Error ? err.message : 'Falha ao atualizar item.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const applyBulkQuantity = async () => {
    const quantity = Math.max(1, Math.floor(Number(bulkQtyInput)) || 0);
    if (!quantity) {
      props.onError('Informe uma quantidade válida (mínimo 1).');
      return;
    }
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    props.onError(null);
    try {
      let latest = props.quote;
      for (const itemId of ids) {
        const item = latest.items.find((i) => i.id === itemId);
        if (!item) continue;
        const technique = techniques.find(
          (t) => t.id === item.engravingTechniqueId,
        );
        const spotOption =
          item.supplier === 'SPOT' && item.engraving
            ? (spotOptionsBySku[item.sku] ?? []).find(
                (o) => o.techniqueName === item.engraving,
              )
            : undefined;
        const engCalc =
          item.supplier === 'SPOT' && spotOption
            ? calcSpotEngravingFromTiers(spotOption, quantity)
            : technique
              ? calcEngravingFromTiers(technique, quantity)
              : item.engravingPrice != null
                ? Number(item.engravingPrice)
                : null;
        const eng =
          engCalc === null || engCalc === undefined ? 0 : round2(engCalc);
        const shouldUpdateEng =
          Boolean(technique) ||
          (item.supplier === 'SPOT' && Boolean(spotOption));
        latest = await updateQuoteItem(latest.id, itemId, {
          quantity,
          ...(shouldUpdateEng ? { engravingPrice: eng } : {}),
        });
      }
      props.onQuoteChange(latest);
      setSelected(new Set());
      setBulkQtyInput('');
    } catch (err) {
      props.onError(
        err instanceof Error
          ? err.message
          : 'Falha ao aplicar quantidade em massa.',
      );
    } finally {
      setBulkBusy(false);
    }
  };

  const handleSelectProduct = async (product: QuoteCatalogProductDto) => {
    setAdding(true);
    props.onError(null);
    try {
      const price = Number(product.salePrice) || 0;
      const updated = await addQuoteItem(props.quote.id, {
        catalogProductId: product.id,
        quantity: 1,
        productPrice: price,
        supplier: product.supplier,
      });
      props.onQuoteChange(updated);
    } catch (err) {
      props.onError(
        err instanceof Error ? err.message : 'Falha ao adicionar produto.',
      );
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (itemId: string) => {
    if (!window.confirm('Remover este produto do orçamento?')) return;
    setBusyId(itemId);
    props.onError(null);
    try {
      const updated = await deleteQuoteItem(props.quote.id, itemId);
      props.onQuoteChange(updated);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    } catch (err) {
      props.onError(
        err instanceof Error ? err.message : 'Falha ao remover item.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleTechniqueChange = async (
    item: QuoteItemDto,
    techniqueId: string,
  ) => {
    if (!techniqueId) {
      const productPrice = Number(item.productPrice ?? item.unitPrice) || 0;
      const unitPrice = finalUnit(productPrice, 0, item.quantity);
      patchLocalItem(item.id, {
        engravingTechniqueId: null,
        engraving: null,
        engravingPrice: null,
        unitPrice: String(unitPrice),
        requiresArtwork: false,
        artworkFileName: null,
        artworkMimeType: null,
        artworkData: null,
      });
      await persistItem(item.id, {
        engravingTechniqueId: null,
        engraving: null,
        engravingPrice: null,
        productPrice,
        requiresArtwork: false,
        artworkFileName: null,
        artworkMimeType: null,
        artworkData: null,
      });
      return;
    }

    const productPrice = Number(item.productPrice ?? item.unitPrice) || 0;

    // SPOT: preço por faixa de quantidade (QuoteCatalogEngravingPriceTier)
    if (item.supplier === 'SPOT') {
      const spotOpts = spotOptionsBySku[item.sku] ?? [];
      const option = spotOpts.find((o) => o.id === techniqueId);
      const engCalc = calcSpotEngravingFromTiers(option, item.quantity);
      const engravingPrice =
        engCalc === null ? 0 : round2(engCalc);
      const unitPrice = finalUnit(productPrice, engravingPrice, item.quantity);
      patchLocalItem(item.id, {
        engravingTechniqueId: null,
        engraving: option?.techniqueName ?? null,
        engravingPrice: String(engravingPrice),
        productPrice: String(productPrice),
        unitPrice: String(unitPrice),
        requiresArtwork: true,
      });
      await persistItem(item.id, {
        engravingTechniqueId: null,
        engraving: option?.techniqueName ?? null,
        engravingPrice,
        productPrice,
        requiresArtwork: true,
      });
      return;
    }

    const technique = techniques.find((t) => t.id === techniqueId);
    const engravingCalc = calcEngravingFromTiers(technique, item.quantity);
    const engravingPrice =
      engravingCalc === null ? 0 : round2(engravingCalc);
    const unitPrice = finalUnit(
      productPrice,
      engravingPrice,
      item.quantity,
    );

    patchLocalItem(item.id, {
      engravingTechniqueId: techniqueId,
      engraving: technique?.name ?? null,
      engravingPrice: String(engravingPrice),
      productPrice: String(productPrice),
      unitPrice: String(unitPrice),
      requiresArtwork: false,
    });
    await persistItem(item.id, {
      engravingTechniqueId: techniqueId,
      engraving: technique?.name ?? null,
      engravingPrice,
      productPrice,
      requiresArtwork: false,
    });
  };

  const handleArtworkUpload = async (item: QuoteItemDto, file: File | null) => {
    if (!file) return;
    const allowed = /^(image\/|application\/pdf)/i.test(file.type);
    if (!allowed) {
      props.onError('Envie uma imagem ou PDF como arquivo de arte.');
      return;
    }
    setBusyId(item.id);
    props.onError(null);
    try {
      const parsed = await readFileAsBase64(file);
      patchLocalItem(item.id, {
        requiresArtwork: true,
        artworkFileName: parsed.fileName,
        artworkMimeType: parsed.mimeType,
        artworkData: parsed.base64,
      });
      await persistItem(item.id, {
        requiresArtwork: true,
        artworkFileName: parsed.fileName,
        artworkMimeType: parsed.mimeType,
        artworkData: parsed.base64,
      });
    } catch (err) {
      props.onError(
        err instanceof Error ? err.message : 'Falha ao enviar arquivo de arte.',
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--erp-border)] bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--erp-fg)]">Produtos</h3>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={adding}
          className="erp-focus-ring erp-btn erp-btn-primary erp-btn--md disabled:opacity-50"
        >
          {adding ? (
            <Loader2 className="erp-icon-sm animate-spin" />
          ) : (
            <Plus className="erp-icon-sm" aria-hidden />
          )}
          Adicionar Produto
        </button>
      </div>

      {selected.size > 0 ? (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-[var(--erp-border)] bg-[var(--erp-bg)] px-3 py-2">
          <span className="text-xs font-medium text-[var(--erp-fg-muted)]">
            {selected.size} selecionado{selected.size === 1 ? '' : 's'}
          </span>
          <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
            Nova quantidade
            <input
              type="number"
              min={1}
              value={bulkQtyInput}
              onChange={(e) => setBulkQtyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void applyBulkQuantity();
              }}
              placeholder="Ex: 100"
              className="erp-module-input mt-1 w-28"
              disabled={bulkBusy}
            />
          </label>
          <button
            type="button"
            onClick={() => void applyBulkQuantity()}
            disabled={bulkBusy || !bulkQtyInput.trim()}
            className="erp-focus-ring erp-btn erp-btn-secondary erp-btn--md disabled:opacity-50"
          >
            {bulkBusy ? (
              <Loader2 className="erp-icon-sm animate-spin" />
            ) : null}
            Aplicar a todos selecionados
          </button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--erp-border)] bg-[var(--erp-bg)] px-3 py-6 text-center text-sm text-[var(--erp-fg-muted)]">
          Nenhum produto neste orçamento.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-[var(--erp-fg-muted)]">
              <tr className="border-b border-[var(--erp-border)]">
                <th className="px-2 py-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selected.size === items.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelected(new Set(items.map((i) => i.id)));
                      } else {
                        setSelected(new Set());
                      }
                    }}
                    aria-label="Selecionar todos"
                  />
                </th>
                <th className="px-2 py-2 font-semibold">Imagem</th>
                <th className="px-2 py-2 font-semibold">SKU</th>
                <th className="px-2 py-2 font-semibold">Descrição</th>
                <th className="px-2 py-2 font-semibold">Gravação</th>
                <th className="px-2 py-2 font-semibold">Qtd</th>
                <th className="px-2 py-2 font-semibold">Preço produto</th>
                <th className="px-2 py-2 font-semibold">Preço grav.</th>
                <th className="px-2 py-2 font-semibold">Preço unit. final</th>
                <th className="px-2 py-2 font-semibold">Total</th>
                <th className="px-2 py-2 font-semibold"> </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const showArtwork =
                  item.supplier === 'SPOT' &&
                  (item.requiresArtwork ||
                    Boolean(item.engravingTechniqueId) ||
                    Boolean(item.engraving?.trim()));
                const productPrice =
                  item.productPrice ?? item.unitPrice ?? '0';
                const engravingPrice = item.engravingPrice ?? '';
                const productUnit = Number(productPrice) || 0;
                const engravingUnit = Number(engravingPrice) || 0;
                const hasProductPrice =
                  item.productPrice != null &&
                  Number.isFinite(Number(item.productPrice));
                // Sempre preferir preço de venda (margem por dentro); nunca custo bruto
                const unitPrecise = hasProductPrice
                  ? finalUnitPrecise(
                      Number(item.productPrice),
                      engravingUnit,
                      item.quantity,
                    )
                  : Number(item.unitPrice) || 0;
                const unitDisplay = round2(unitPrecise);
                const lineTotalDisplay = round2(unitDisplay * item.quantity);
                const spotOption =
                  item.supplier === 'SPOT' && item.engraving
                    ? (spotOptionsBySku[item.sku] ?? []).find(
                        (o) => o.techniqueName === item.engraving,
                      )
                    : undefined;
                const currentQty =
                  qtyDrafts[item.id] !== undefined
                    ? Math.max(
                        1,
                        Math.floor(Number(qtyDrafts[item.id])) || 1,
                      )
                    : item.quantity;
                const spotMinQty = spotEngravingMinQty(spotOption);
                const spotBelowMin =
                  spotOption != null &&
                  spotMinQty != null &&
                  currentQty < spotMinQty;
                return (
                  <tr
                    key={item.id}
                    className="border-b border-[var(--erp-border)]/70"
                  >
                    <td className="px-2 py-2 align-middle">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={(e) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(item.id);
                            else next.delete(item.id);
                            return next;
                          });
                        }}
                        aria-label={`Selecionar ${item.sku}`}
                      />
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <CrmOrcamentoProductImage
                        src={item.imageUrl}
                        alt={item.description}
                        size="list"
                      />
                    </td>
                    <td className="px-2 py-2 align-middle font-medium text-[#2AACE2]">
                      <div>{item.sku}</div>
                      {item.supplier ? (
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--erp-fg-muted)]">
                          {item.supplier}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 align-middle">{item.description}</td>
                    <td className="px-2 py-2 align-middle">
                      <div className="flex min-w-[11rem] items-center gap-1.5">
                        <select
                          value={
                            item.supplier === 'SPOT'
                              ? (spotOptionsBySku[item.sku]?.find(
                                  (o) => o.techniqueName === item.engraving,
                                )?.id ?? '')
                              : (item.engravingTechniqueId ?? '')
                          }
                          disabled={busyId === item.id}
                          onChange={(e) => {
                            void handleTechniqueChange(item, e.target.value);
                          }}
                          className="erp-module-input"
                        >
                          <option value="">Sem gravação</option>
                          {item.supplier === 'SPOT'
                            ? (spotOptionsBySku[item.sku] ?? []).map((o) => {
                                const tierPrice = calcSpotEngravingFromTiers(
                                  o,
                                  currentQty,
                                );
                                const labelPrice =
                                  tierPrice != null
                                    ? tierPrice
                                    : o.price != null
                                      ? Number(o.price)
                                      : null;
                                return (
                                  <option key={o.id} value={o.id}>
                                    {o.techniqueName}
                                    {labelPrice != null &&
                                    Number.isFinite(labelPrice)
                                      ? ` — ${formatQuoteCurrency(labelPrice)}`
                                      : ''}
                                  </option>
                                );
                              })
                            : techniques.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                        </select>
                        {showArtwork ? (
                          <label
                            className="erp-focus-ring inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                            title={
                              item.artworkFileName
                                ? `Arte: ${item.artworkFileName}`
                                : 'Enviar arte (imagem/PDF)'
                            }
                          >
                            <Upload className="h-3.5 w-3.5" aria-hidden />
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              className="hidden"
                              disabled={busyId === item.id}
                              onChange={(e) => {
                                const file = e.target.files?.[0] ?? null;
                                void handleArtworkUpload(item, file);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <input
                        type="number"
                        min={1}
                        value={
                          qtyDrafts[item.id] !== undefined
                            ? qtyDrafts[item.id]
                            : String(item.quantity)
                        }
                        disabled={busyId === item.id}
                        onChange={(e) => {
                          setQtyDrafts((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }));
                        }}
                          onBlur={(e) => {
                          const quantity = Math.max(
                            1,
                            Math.floor(Number(e.target.value)) || 1,
                          );
                          setQtyDrafts((prev) => {
                            const next = { ...prev };
                            delete next[item.id];
                            return next;
                          });
                          const technique = techniques.find(
                            (t) => t.id === item.engravingTechniqueId,
                          );
                          const spotOption =
                            item.supplier === 'SPOT' && item.engraving
                              ? (spotOptionsBySku[item.sku] ?? []).find(
                                  (o) => o.techniqueName === item.engraving,
                                )
                              : undefined;
                          const pp =
                            Number(item.productPrice ?? item.unitPrice) || 0;
                          const engCalc =
                            item.supplier === 'SPOT' && spotOption
                              ? calcSpotEngravingFromTiers(
                                  spotOption,
                                  quantity,
                                )
                              : technique
                                ? calcEngravingFromTiers(technique, quantity)
                                : item.engravingPrice != null
                                  ? Number(item.engravingPrice)
                                  : null;
                          const eng =
                            engCalc === null || engCalc === undefined
                              ? 0
                              : round2(engCalc);
                          const shouldUpdateEng =
                            Boolean(technique) ||
                            (item.supplier === 'SPOT' && Boolean(spotOption));
                          if (
                            quantity !== item.quantity ||
                            (shouldUpdateEng &&
                              eng !==
                                (Number(item.engravingPrice ?? 0) || 0))
                          ) {
                            patchLocalItem(item.id, {
                              quantity,
                              ...(shouldUpdateEng
                                ? { engravingPrice: String(eng) }
                                : {}),
                              unitPrice: String(finalUnit(pp, eng, quantity)),
                            });
                            void persistItem(item.id, {
                              quantity,
                              ...(shouldUpdateEng
                                ? { engravingPrice: eng }
                                : {}),
                            });
                          }
                        }}
                        className="erp-module-input w-20"
                      />
                      {spotBelowMin && spotMinQty != null ? (
                        <p className="mt-1 max-w-[9rem] text-[10px] font-medium leading-tight text-amber-700">
                          Quantidade mínima para esta gravação: {spotMinQty}{' '}
                          unidades
                        </p>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <div className="flex flex-col gap-0.5">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={productPrice}
                          disabled={busyId === item.id}
                          onChange={(e) => {
                            const pp = Math.max(0, Number(e.target.value) || 0);
                            const eng = Number(item.engravingPrice ?? 0) || 0;
                            patchLocalItem(item.id, {
                              productPrice: String(pp),
                              unitPrice: String(
                                finalUnit(pp, eng, item.quantity),
                              ),
                            });
                          }}
                          onBlur={(e) => {
                            const pp = Math.max(0, Number(e.target.value) || 0);
                            void persistItem(item.id, {
                              productPrice: pp,
                            });
                          }}
                          className="erp-module-input w-28"
                        />
                        <span className="pl-0.5 text-[11px] text-[var(--erp-fg-muted)]">
                          {formatQuoteCurrency(
                            qtyTotal(productUnit, item.quantity),
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <div className="flex flex-col gap-0.5">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={engravingPrice}
                          disabled={
                            busyId === item.id ||
                            !(
                              item.engravingTechniqueId ||
                              (item.supplier === 'SPOT' && item.engraving)
                            )
                          }
                          placeholder="—"
                          onChange={(e) => {
                            const eng = Math.max(
                              0,
                              Number(e.target.value) || 0,
                            );
                            const pp = Number(item.productPrice ?? 0) || 0;
                            patchLocalItem(item.id, {
                              engravingPrice: String(eng),
                              unitPrice: String(
                                finalUnit(pp, eng, item.quantity),
                              ),
                            });
                          }}
                          onBlur={(e) => {
                            const eng = Math.max(
                              0,
                              Number(e.target.value) || 0,
                            );
                            void persistItem(item.id, {
                              engravingPrice: eng,
                            });
                          }}
                          className="erp-module-input w-28 disabled:opacity-50"
                        />
                        <span className="pl-0.5 text-[11px] text-[var(--erp-fg-muted)]">
                          {item.engravingTechniqueId ||
                          (item.supplier === 'SPOT' && item.engraving)
                            ? formatQuoteCurrency(
                                qtyTotal(engravingUnit, item.quantity),
                              )
                            : '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={unitDisplay}
                        disabled={busyId === item.id}
                        onChange={(e) => {
                          patchLocalItem(item.id, {
                            unitPrice: e.target.value,
                          });
                        }}
                        onBlur={(e) => {
                          const unitPrice = Math.max(
                            0,
                            Number(e.target.value) || 0,
                          );
                          void persistItem(item.id, { unitPrice });
                        }}
                        className="erp-module-input w-28"
                      />
                    </td>
                    <td className="px-2 py-2 align-middle font-medium">
                      {formatQuoteCurrency(lineTotalDisplay)}
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <button
                        type="button"
                        onClick={() => void handleRemove(item.id)}
                        disabled={busyId === item.id}
                        className="erp-focus-ring inline-flex h-8 w-8 items-center justify-center rounded-md p-2 text-[var(--erp-fg-muted)] hover:bg-[var(--erp-bg)] hover:text-rose-600 disabled:opacity-40"
                        title="Remover"
                        aria-label={`Remover ${item.sku}`}
                      >
                        {busyId === item.id ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 shrink-0" />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {items.length > 0 ? (
        <div className="mt-4 ml-auto w-full max-w-sm space-y-1.5 border-t border-[var(--erp-border)] pt-3 text-sm">
          <div className="flex justify-between gap-4 text-[var(--erp-fg-muted)]">
            <span>Subtotal dos itens:</span>
            <strong className="text-[var(--erp-fg)]">
              {formatQuoteCurrency(liveSubtotalDisplay)}
            </strong>
          </div>
          <div className="flex justify-between gap-4 text-[var(--erp-fg-muted)]">
            <span>Difal e Substituição Tributária:</span>
            <strong className="text-[var(--erp-fg)]">
              {formatQuoteCurrency(difalValue)}
            </strong>
          </div>
          <div className="flex justify-between gap-4 text-[var(--erp-fg-muted)]">
            <span>Outros Custos Extras:</span>
            <strong className="text-[var(--erp-fg)]">
              {formatQuoteCurrency(otherExtraCosts)}
            </strong>
          </div>
          <div className="my-2 border-t border-[var(--erp-border)]" />
          <div className="flex justify-between gap-4 text-[var(--erp-fg)]">
            <span className="font-medium">Custo Total:</span>
            <strong>{formatQuoteCurrency(custoTotalDisplay)}</strong>
          </div>
          <div className="flex justify-between gap-4 text-base font-semibold text-[var(--erp-fg)]">
            <span>Venda Total:</span>
            <span>{formatQuoteCurrency(liveTotal)}</span>
          </div>
        </div>
      ) : null}

      <CrmOrcamentoCatalogPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(product) => void handleSelectProduct(product)}
      />
    </div>
  );
}
