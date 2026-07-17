'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { CrmOrcamentoProductsSection } from '@/src/components/crm/orcamentos/crm-orcamento-products';
import { CrmOrcamentoProposalsTab } from '@/src/components/crm/orcamentos/crm-orcamento-proposals-tab';
import { CrmOrcamentoRichText } from '@/src/components/crm/orcamentos/crm-orcamento-rich-text';
import { CrmOrcamentoSendProposalModal } from '@/src/components/crm/orcamentos/crm-orcamento-send-proposal-modal';
import { canViewQuoteMargin } from '@/src/components/crm/orcamentos/quote-margin-access';
import { useNavPermissions } from '@/src/components/layout/nav-permissions-context';
import type { CrmUserDto } from '@/src/services/api/crm-api';
import {
  convertQuoteToOrder,
  createQuote,
  createQuoteProposal,
  formatQuoteCurrency,
  QUOTE_STATUS_BADGE_CLASS,
  QUOTE_STATUS_LABEL,
  QUOTE_STATUSES,
  searchQuotePeople,
  updateQuote,
  type QuoteCustomerType,
  type QuoteDto,
  type QuotePayload,
  type QuotePersonSearchResult,
  type QuoteStatus,
} from '@/src/services/api/quotes-api';
import { useRouter } from 'next/navigation';

const DEFAULT_SALES_MARGIN_PERCENT = 40;

function parsePercent(value: string, fallback: number) {
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function roundMoney2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Margem por dentro (sem arredondar intermediários).
 * Forma estável que preserva rateio mínimo de Difal/outros:
 * (produto*qtd + grav*qtd + difal + outros) / (qtd * (1 - totalPercent/100))
 */
function calcItemUnitWithRatesPrecise(
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

/** Infere a margem de venda a partir do preço já gravado (quando a API não a devolve). */
function inferSalesMarginPercent(quote: QuoteDto): number {
  if (quote.salesMarginPercent != null && quote.salesMarginPercent !== '') {
    return parsePercent(String(quote.salesMarginPercent), DEFAULT_SALES_MARGIN_PERCENT);
  }
  const commission = parsePercent(String(quote.commissionPercent ?? '2'), 2);
  const reserve = parsePercent(String(quote.marginReservePercent ?? '6'), 6);
  const difal = parsePercent(String(quote.difalValue ?? '0'), 0);
  const other = parsePercent(String(quote.otherExtraCosts ?? '0'), 0);
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
    const totalPercent = (1 - custoBase / unit) * 100;
    const salesPct = totalPercent - commission - reserve;
    if (Number.isFinite(salesPct) && salesPct >= 0) {
      return Math.round(salesPct * 10000) / 10000;
    }
  }
  return DEFAULT_SALES_MARGIN_PERCENT;
}

function applyRatesToQuote(
  quote: QuoteDto,
  commissionPercent: number,
  marginReservePercent: number,
  salesMarginPercent: number,
  difalValue?: number,
  otherExtraCosts?: number,
): QuoteDto {
  const difal =
    difalValue !== undefined
      ? difalValue
      : Number(quote.difalValue ?? 0) || 0;
  const other =
    otherExtraCosts !== undefined
      ? otherExtraCosts
      : Number(quote.otherExtraCosts ?? 0) || 0;
  let subtotalPrecise = 0;
  const items = (quote.items ?? []).map((item) => {
    const product = Number(item.productPrice);
    const engraving = Number(item.engravingPrice ?? 0) || 0;
    const hasProduct = item.productPrice != null && Number.isFinite(product);
    const unitPrecise = hasProduct
      ? calcItemUnitWithRatesPrecise(
          product,
          engraving,
          commissionPercent,
          marginReservePercent,
          salesMarginPercent,
          item.quantity,
          difal,
          other,
        )
      : Number(item.unitPrice) || 0;
    const unitRounded = roundMoney2(unitPrecise);
    const lineTotal = unitRounded * item.quantity;
    subtotalPrecise += lineTotal;
    return {
      ...item,
      unitPrice: String(unitRounded),
      total: String(roundMoney2(lineTotal)),
    };
  });
  const freight = quote.freightToConsult
    ? 0
    : Number(quote.freightValue ?? 0) || 0;
  return {
    ...quote,
    commissionPercent: String(commissionPercent),
    marginReservePercent: String(marginReservePercent),
    difalValue: String(difal),
    otherExtraCosts: String(other),
    ...(quote.salesMarginPercent != null
      ? { salesMarginPercent: String(salesMarginPercent) }
      : {}),
    items,
    subtotal: String(roundMoney2(subtotalPrecise)),
    total: String(roundMoney2(subtotalPrecise + freight)),
  };
}

function toDateInput(iso: string | undefined) {
  if (!iso) return new Date().toISOString().slice(0, 10);
  return iso.slice(0, 10);
}

function emptyForm(): {
  code: string;
  requestDate: string;
  customerOrderRef: string;
  billingCompany: string;
  status: QuoteStatus;
  customerType: QuoteCustomerType;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerDocument: string;
  responsibleUserId: string;
  observations: string;
  customerNotes: string;
  carrierId: string;
  deliveryAddress: string;
  freightValue: string;
  freightToConsult: boolean;
  deliveryDeadline: string;
  freightType: string;
  paymentTerms: string;
  paymentMethod: string;
  linkedCrmCardId: string;
  subtotal: string;
  total: string;
  commissionPercent: string;
  marginReservePercent: string;
  salesMarginPercent: string;
  difalValue: string;
  otherExtraCosts: string;
} {
  return {
    code: 'Novo',
    requestDate: toDateInput(undefined),
    customerOrderRef: '',
    billingCompany: '',
    status: 'AGUARDANDO',
    customerType: 'PJ',
    customerId: '',
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    customerDocument: '',
    responsibleUserId: '',
    observations: '',
    customerNotes: '',
    carrierId: '',
    deliveryAddress: '',
    freightValue: '0',
    freightToConsult: false,
    deliveryDeadline: '',
    freightType: '',
    paymentTerms: '',
    paymentMethod: '',
    linkedCrmCardId: '',
    subtotal: '0',
    total: '0',
    commissionPercent: '2',
    marginReservePercent: '6',
    salesMarginPercent: String(DEFAULT_SALES_MARGIN_PERCENT),
    difalValue: '0',
    otherExtraCosts: '0',
  };
}

function fromQuote(quote: QuoteDto) {
  return {
    code: quote.code,
    requestDate: toDateInput(quote.requestDate),
    customerOrderRef: quote.customerOrderRef ?? '',
    billingCompany: quote.billingCompany ?? '',
    status: (QUOTE_STATUSES.includes(quote.status as QuoteStatus)
      ? quote.status
      : 'AGUARDANDO') as QuoteStatus,
    customerType: (quote.customerType === 'PF' ? 'PF' : 'PJ') as QuoteCustomerType,
    customerId: quote.customerId ?? '',
    customerName: quote.customerName ?? '',
    customerEmail: quote.customerEmail ?? '',
    customerPhone: quote.customerPhone ?? '',
    customerDocument: quote.customerDocument ?? '',
    responsibleUserId: quote.responsibleUserId ?? '',
    observations: quote.observations ?? '',
    customerNotes: quote.customerNotes ?? '',
    carrierId: quote.carrierId ?? '',
    deliveryAddress: quote.deliveryAddress ?? '',
    freightValue: quote.freightValue ?? '0',
    freightToConsult: quote.freightToConsult,
    deliveryDeadline: quote.deliveryDeadline ?? '',
    freightType: quote.freightType ?? '',
    paymentTerms: quote.paymentTerms ?? '',
    paymentMethod: quote.paymentMethod ?? '',
    linkedCrmCardId: quote.linkedCrmCardId ?? '',
    subtotal: quote.subtotal ?? '0',
    total: quote.total ?? '0',
    commissionPercent: quote.commissionPercent ?? '2',
    marginReservePercent: quote.marginReservePercent ?? '6',
    salesMarginPercent:
      quote.salesMarginPercent ?? String(DEFAULT_SALES_MARGIN_PERCENT),
    difalValue: quote.difalValue ?? '0',
    otherExtraCosts: quote.otherExtraCosts ?? '0',
  };
}

export function CrmOrcamentoForm(props: {
  quote: QuoteDto | null;
  users: CrmUserDto[];
  onBack: () => void;
  onSaved: (quote: QuoteDto) => void;
}) {
  const router = useRouter();
  const { user } = useNavPermissions();
  const showSalesMargin = canViewQuoteMargin(user);
  const [currentQuote, setCurrentQuote] = useState<QuoteDto | null>(props.quote);
  const [formTab, setFormTab] = useState<'detalhes' | 'propostas'>('detalhes');
  const [proposalsRefresh, setProposalsRefresh] = useState(0);
  const [converting, setConverting] = useState(false);
  const [sendModal, setSendModal] = useState<{
    proposalId: string;
  } | null>(null);
  const [form, setForm] = useState(() =>
    props.quote ? fromQuote(props.quote) : emptyForm(),
  );
  const [personSearch, setPersonSearch] = useState('');
  const [personResults, setPersonResults] = useState<QuotePersonSearchResult[]>([]);
  const [personLoading, setPersonLoading] = useState(false);
  const [personPickerOpen, setPersonPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pricingBusy, setPricingBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pricingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCurrentQuote(props.quote);
    setForm(props.quote ? fromQuote(props.quote) : emptyForm());
    setPersonSearch(props.quote?.customerName ?? '');
  }, [props.quote]);

  useEffect(() => {
    return () => {
      if (pricingDebounceRef.current) clearTimeout(pricingDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (!personPickerOpen) return;
    const handle = window.setTimeout(() => {
      setPersonLoading(true);
      void searchQuotePeople(personSearch)
        .then((rows) => setPersonResults(rows))
        .catch(() => setPersonResults([]))
        .finally(() => setPersonLoading(false));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [personSearch, personPickerOpen]);

  const setField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const selectPerson = (person: QuotePersonSearchResult) => {
    setForm((prev) => ({
      ...prev,
      customerId: person.customerId ?? '',
      linkedCrmCardId: person.linkedCrmCardId ?? '',
      customerName: person.name,
      customerEmail: person.email ?? '',
      customerPhone: person.phone ?? '',
      customerDocument: person.document ?? prev.customerDocument,
      deliveryAddress:
        prev.deliveryAddress || person.deliveryAddress || prev.deliveryAddress,
    }));
    setPersonSearch(person.name);
    setPersonPickerOpen(false);
  };

  const buildPayload = (): QuotePayload => {
    const freight = Number(String(form.freightValue).replace(',', '.'));
    const payload: QuotePayload = {
      requestDate: new Date(`${form.requestDate}T12:00:00`).toISOString(),
      customerOrderRef: form.customerOrderRef.trim() || null,
      billingCompany: form.billingCompany.trim() || null,
      status: form.status,
      customerType: form.customerType,
      customerId: form.customerId || null,
      customerName: form.customerName.trim() || 'Cliente',
      customerEmail: form.customerEmail.trim() || null,
      customerPhone: form.customerPhone.trim() || null,
      customerDocument: form.customerDocument.trim() || null,
      responsibleUserId: form.responsibleUserId || null,
      origin: 'SISTEMA',
      observations: form.observations.trim() || null,
      customerNotes: form.customerNotes.trim() || null,
      carrierId: form.carrierId || null,
      deliveryAddress: form.deliveryAddress.trim() || null,
      freightValue: Number.isFinite(freight) ? freight : 0,
      freightToConsult: form.freightToConsult,
      deliveryDeadline: form.deliveryDeadline.trim() || null,
      freightType: form.freightType.trim() || null,
      paymentTerms: form.paymentTerms.trim() || null,
      paymentMethod: form.paymentMethod.trim() || null,
      linkedCrmCardId: form.linkedCrmCardId || null,
    };
    const commission = Number(String(form.commissionPercent).replace(',', '.'));
    const reserve = Number(String(form.marginReservePercent).replace(',', '.'));
    payload.commissionPercent = Number.isFinite(commission) ? commission : 2;
    payload.marginReservePercent = Number.isFinite(reserve) ? reserve : 6;
    if (showSalesMargin) {
      const sales = Number(String(form.salesMarginPercent).replace(',', '.'));
      payload.salesMarginPercent = Number.isFinite(sales)
        ? sales
        : DEFAULT_SALES_MARGIN_PERCENT;
    }
    const difal = Number(String(form.difalValue).replace(',', '.'));
    const otherExtras = Number(String(form.otherExtraCosts).replace(',', '.'));
    payload.difalValue = Number.isFinite(difal) ? Math.max(0, difal) : 0;
    payload.otherExtraCosts = Number.isFinite(otherExtras)
      ? Math.max(0, otherExtras)
      : 0;
    return payload;
  };

  const persistExtras = async (difalRaw: string, otherRaw: string) => {
    if (!currentQuote) return;
    const difalValue = Math.max(0, parsePercent(difalRaw, 0));
    const otherExtraCosts = Math.max(0, parsePercent(otherRaw, 0));

    setPricingBusy(true);
    setError(null);
    try {
      const updated = await updateQuote(currentQuote.id, {
        difalValue,
        otherExtraCosts,
      });
      setCurrentQuote(updated);
      setForm((prev) => ({
        ...prev,
        difalValue: updated.difalValue ?? String(difalValue),
        otherExtraCosts: updated.otherExtraCosts ?? String(otherExtraCosts),
        subtotal: updated.subtotal,
        total: updated.total,
      }));
      props.onSaved(updated);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Falha ao atualizar extras.',
      );
    } finally {
      setPricingBusy(false);
    }
  };

  const handleExtrasChange = (
    field: 'difalValue' | 'otherExtraCosts',
    value: string,
  ) => {
    const nextDifal = field === 'difalValue' ? value : form.difalValue;
    const nextOther = field === 'otherExtraCosts' ? value : form.otherExtraCosts;
    const difal = Math.max(0, parsePercent(nextDifal, 0));
    const other = Math.max(0, parsePercent(nextOther, 0));
    setForm((prev) => ({ ...prev, [field]: value }));
    if (currentQuote) {
      const commissionPercent = parsePercent(form.commissionPercent, 2);
      const marginReservePercent = parsePercent(form.marginReservePercent, 6);
      const salesMarginPercent = resolveSalesForLocalCalc(
        currentQuote,
        form.salesMarginPercent,
      );
      const local = applyRatesToQuote(
        currentQuote,
        commissionPercent,
        marginReservePercent,
        salesMarginPercent,
        difal,
        other,
      );
      setCurrentQuote(local);
      setForm((prev) => ({
        ...prev,
        [field]: value,
        subtotal: local.subtotal,
        total: local.total,
      }));
    }
  };

  const persistPricingRates = async (
    commissionRaw: string,
    reserveRaw: string,
    salesRaw?: string,
  ) => {
    if (!currentQuote) return;
    const commissionPercent = parsePercent(commissionRaw, 2);
    const marginReservePercent = parsePercent(reserveRaw, 6);
    const salesMarginPercent = showSalesMargin
      ? parsePercent(
          salesRaw ?? form.salesMarginPercent,
          DEFAULT_SALES_MARGIN_PERCENT,
        )
      : undefined;
    const prevC = parsePercent(String(currentQuote.commissionPercent ?? '2'), 2);
    const prevR = parsePercent(
      String(currentQuote.marginReservePercent ?? '6'),
      6,
    );
    const prevS = showSalesMargin
      ? parsePercent(
          String(currentQuote.salesMarginPercent ?? form.salesMarginPercent),
          DEFAULT_SALES_MARGIN_PERCENT,
        )
      : undefined;
    if (
      prevC === commissionPercent &&
      prevR === marginReservePercent &&
      (salesMarginPercent === undefined || prevS === salesMarginPercent)
    ) {
      return;
    }

    setPricingBusy(true);
    setError(null);
    try {
      const updated = await updateQuote(currentQuote.id, {
        commissionPercent,
        marginReservePercent,
        ...(salesMarginPercent !== undefined
          ? { salesMarginPercent }
          : {}),
      });
      setCurrentQuote(updated);
      setForm((prev) => ({
        ...prev,
        commissionPercent: updated.commissionPercent ?? String(commissionPercent),
        marginReservePercent:
          updated.marginReservePercent ?? String(marginReservePercent),
        ...(updated.salesMarginPercent != null
          ? { salesMarginPercent: updated.salesMarginPercent }
          : salesMarginPercent !== undefined
            ? { salesMarginPercent: String(salesMarginPercent) }
            : {}),
        subtotal: updated.subtotal,
        total: updated.total,
      }));
      props.onSaved(updated);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Falha ao recalcular preços com comissão/reserva/margem.',
      );
    } finally {
      setPricingBusy(false);
    }
  };

  const schedulePricingPersist = (
    commissionRaw: string,
    reserveRaw: string,
    salesRaw?: string,
  ) => {
    if (pricingDebounceRef.current) clearTimeout(pricingDebounceRef.current);
    pricingDebounceRef.current = setTimeout(() => {
      void persistPricingRates(commissionRaw, reserveRaw, salesRaw);
    }, 400);
  };

  const resolveSalesForLocalCalc = (
    quote: QuoteDto,
    formSales: string,
  ): number => {
    if (showSalesMargin) {
      return parsePercent(formSales, DEFAULT_SALES_MARGIN_PERCENT);
    }
    return inferSalesMarginPercent(quote);
  };

  const handlePricingFieldChange = (
    field:
      | 'commissionPercent'
      | 'marginReservePercent'
      | 'salesMarginPercent',
    value: string,
  ) => {
    const nextCommission =
      field === 'commissionPercent' ? value : form.commissionPercent;
    const nextReserve =
      field === 'marginReservePercent' ? value : form.marginReservePercent;
    const nextSales =
      field === 'salesMarginPercent' ? value : form.salesMarginPercent;
    const commissionPercent = parsePercent(nextCommission, 2);
    const marginReservePercent = parsePercent(nextReserve, 6);
    const salesMarginPercent = resolveSalesForLocalCalc(
      currentQuote ?? ({ items: [] } as unknown as QuoteDto),
      nextSales,
    );

    if (currentQuote) {
      const local = applyRatesToQuote(
        {
          ...currentQuote,
          ...(showSalesMargin
            ? { salesMarginPercent: nextSales }
            : {}),
        },
        commissionPercent,
        marginReservePercent,
        salesMarginPercent,
      );
      setCurrentQuote(local);
      setForm((prev) => ({
        ...prev,
        [field]: value,
        subtotal: local.subtotal,
        total: local.total,
      }));
      schedulePricingPersist(nextCommission, nextReserve, nextSales);
      return;
    }

    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (): Promise<QuoteDto | null> => {
    if (!form.customerName.trim()) {
      setError('Informe o nome do cliente.');
      return null;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = buildPayload();
      const saved = currentQuote
        ? await updateQuote(currentQuote.id, payload)
        : await createQuote(payload);
      setCurrentQuote(saved);
      setForm(fromQuote(saved));
      props.onSaved(saved);
      return saved;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar orçamento.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateAndCreateProposal = async () => {
    const saved = await handleSave();
    if (!saved) return;
    setSaving(true);
    setError(null);
    try {
      await createQuoteProposal(saved.id, {
        contactEmail: saved.customerEmail,
        contactName: saved.customerName,
      });
      setProposalsRefresh((v) => v + 1);
      setFormTab('propostas');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Falha ao gerar proposta.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateAndSend = async () => {
    const saved = await handleSave();
    if (!saved) return;
    setSaving(true);
    setError(null);
    try {
      const result = await createQuoteProposal(saved.id, {
        contactEmail: saved.customerEmail,
        contactName: saved.customerName,
      });
      setProposalsRefresh((v) => v + 1);
      if (result.proposalId) {
        setSendModal({ proposalId: result.proposalId });
      } else {
        setFormTab('propostas');
        setError(
          'Proposta gerada, mas não foi possível abrir o envio. Use a aba Propostas.',
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Falha ao gerar proposta.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleConvertToOrder = async () => {
    const saved = await handleSave();
    if (!saved) return;
    setConverting(true);
    setError(null);
    try {
      const result = await convertQuoteToOrder(saved.id);
      setCurrentQuote(result.quote);
      setForm(fromQuote(result.quote));
      props.onSaved(result.quote);
      router.push(
        `/app/expedicao/pedidos?search=${encodeURIComponent(result.order.code)}`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Falha ao converter em pedido.',
      );
    } finally {
      setConverting(false);
    }
  };

  const ensureSavedForProducts = async () => {
    if (currentQuote) return currentQuote;
    return handleSave();
  };

  const statusSelectClass =
    QUOTE_STATUS_BADGE_CLASS[form.status] ??
    'bg-slate-100 text-slate-700 ring-1 ring-slate-200';

  /** Mesma fonte da tabela de itens / Total Final — não usa Quote.subtotal desatualizado. */
  const liveQuoteMoney = useMemo(() => {
    const quote = currentQuote;
    if (!quote) {
      return {
        subtotal: roundMoney2(Number(form.subtotal) || 0),
        total: roundMoney2(Number(form.total) || 0),
      };
    }
    const commissionPercent = parsePercent(
      String(quote.commissionPercent ?? form.commissionPercent),
      2,
    );
    const marginReservePercent = parsePercent(
      String(quote.marginReservePercent ?? form.marginReservePercent),
      6,
    );
    const salesMarginPercent = resolveSalesForLocalCalc(
      quote,
      form.salesMarginPercent,
    );
    const difal = parsePercent(form.difalValue, 0);
    const other = parsePercent(form.otherExtraCosts, 0);
    let subtotalPrecise = 0;
    for (const item of quote.items ?? []) {
      const product = Number(item.productPrice);
      const hasProduct =
        item.productPrice != null && Number.isFinite(product);
      if (hasProduct) {
        const eng = Number(item.engravingPrice ?? 0) || 0;
        const unitRounded = roundMoney2(
          calcItemUnitWithRatesPrecise(
            product,
            eng,
            commissionPercent,
            marginReservePercent,
            salesMarginPercent,
            item.quantity,
            difal,
            other,
          ),
        );
        subtotalPrecise += unitRounded * item.quantity;
      } else {
        const unitRounded = roundMoney2(Number(item.unitPrice) || 0);
        subtotalPrecise += unitRounded * item.quantity;
      }
    }
    const freight = quote.freightToConsult
      ? 0
      : Number(quote.freightValue ?? form.freightValue ?? 0) || 0;
    return {
      subtotal: roundMoney2(subtotalPrecise),
      total: roundMoney2(subtotalPrecise + freight),
    };
  }, [
    currentQuote,
    form.subtotal,
    form.total,
    form.commissionPercent,
    form.marginReservePercent,
    form.salesMarginPercent,
    form.difalValue,
    form.otherExtraCosts,
    form.freightValue,
    showSalesMargin,
  ]);

  const displaySubtotal = liveQuoteMoney.subtotal;
  const displayTotal = liveQuoteMoney.total;

  const salesMarginHint = useMemo(() => {
    if (!showSalesMargin) return null;
    const subtotal = Number(displaySubtotal) || 0;
    const salesPct = parsePercent(
      form.salesMarginPercent,
      DEFAULT_SALES_MARGIN_PERCENT,
    );
    // Subtotal já inclui a margem por dentro; parcela da margem de venda.
    const amount = salesPct > 0 ? (subtotal * salesPct) / 100 : 0;
    return { salesPct, amount };
  }, [showSalesMargin, displaySubtotal, form.salesMarginPercent]);

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={props.onBack}
          className="erp-focus-ring erp-btn erp-btn-ghost erp-btn--md"
        >
          <ArrowLeft className="erp-icon-sm" aria-hidden />
          Voltar à lista
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="erp-focus-ring erp-btn erp-btn-ghost erp-btn--md disabled:opacity-50"
          >
            {saving ? <Loader2 className="erp-icon-sm animate-spin" /> : null}
            Salvar
          </button>
          <button
            type="button"
            onClick={() => void handleUpdateAndCreateProposal()}
            disabled={saving || !currentQuote}
            className="erp-focus-ring erp-btn erp-btn-secondary erp-btn--md disabled:opacity-50"
            title={!currentQuote ? 'Salve o orçamento primeiro' : undefined}
          >
            Atualizar e criar proposta
          </button>
          <button
            type="button"
            onClick={() => void handleUpdateAndSend()}
            disabled={saving || converting || !currentQuote}
            className="erp-focus-ring erp-btn erp-btn-primary erp-btn--md disabled:opacity-50"
            title={!currentQuote ? 'Salve o orçamento primeiro' : undefined}
          >
            Atualizar e enviar
          </button>
          <button
            type="button"
            onClick={() => void handleConvertToOrder()}
            disabled={saving || converting || !currentQuote || Boolean(currentQuote?.linkedOrderId)}
            className="erp-focus-ring erp-btn erp-btn-secondary erp-btn--md disabled:opacity-50"
            title={
              currentQuote?.linkedOrderId
                ? 'Já convertido em pedido'
                : !currentQuote
                  ? 'Salve o orçamento primeiro'
                  : undefined
            }
          >
            {converting ? <Loader2 className="erp-icon-sm animate-spin" /> : null}
            Salvar e Enviar Pedido
          </button>
        </div>
      </div>

      {error ? <div className="erp-alert-danger mb-3 shrink-0">{error}</div> : null}

      <div className="mb-3 flex shrink-0 gap-1 border-b border-[var(--erp-border)]">
        <button
          type="button"
          onClick={() => setFormTab('detalhes')}
          className={`erp-focus-ring rounded-t-lg px-3 py-2 text-sm font-semibold ${
            formTab === 'detalhes'
              ? 'bg-white text-[#2AACE2] shadow-sm'
              : 'text-[var(--erp-fg-muted)] hover:text-[var(--erp-fg)]'
          }`}
        >
          Detalhes
        </button>
        <button
          type="button"
          onClick={() => setFormTab('propostas')}
          disabled={!currentQuote}
          className={`erp-focus-ring rounded-t-lg px-3 py-2 text-sm font-semibold disabled:opacity-40 ${
            formTab === 'propostas'
              ? 'bg-white text-[#2AACE2] shadow-sm'
              : 'text-[var(--erp-fg-muted)] hover:text-[var(--erp-fg)]'
          }`}
        >
          Propostas
        </button>
      </div>

      {formTab === 'propostas' && currentQuote ? (
        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          <CrmOrcamentoProposalsTab
            key={`${currentQuote.id}-${proposalsRefresh}`}
            quote={currentQuote}
            onError={setError}
          />
        </div>
      ) : null}

      {formTab === 'detalhes' ? (
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-6">
        <div className="rounded-xl border border-[var(--erp-border)] bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 border-b border-[var(--erp-border)] pb-2">
            <span className="rounded-md bg-[#2AACE2]/15 px-2.5 py-1 text-xs font-semibold text-[#2AACE2]">
              Detalhes
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
              Código
              <input
                value={form.code}
                readOnly
                className="erp-module-input mt-1 bg-[var(--erp-bg)]"
              />
            </label>
            <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
              Pedido do cliente
              <input
                value={form.customerOrderRef}
                onChange={(e) => setField('customerOrderRef', e.target.value)}
                className="erp-module-input mt-1"
              />
            </label>
            <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
              Empresa faturamento
              <input
                value={form.billingCompany}
                onChange={(e) => setField('billingCompany', e.target.value)}
                className="erp-module-input mt-1"
              />
            </label>
            <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
              Status
              <select
                value={form.status}
                onChange={(e) => setField('status', e.target.value as QuoteStatus)}
                className={`erp-module-input mt-1 font-semibold ${statusSelectClass}`}
              >
                {QUOTE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {QUOTE_STATUS_LABEL[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
              Data solicitação
              <input
                type="date"
                value={form.requestDate}
                onChange={(e) => setField('requestDate', e.target.value)}
                className="erp-module-input mt-1"
              />
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--erp-border)] bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-[var(--erp-fg)]">
            Dados do cliente
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
              Tipo
              <select
                value={form.customerType}
                onChange={(e) =>
                  setField('customerType', e.target.value as QuoteCustomerType)
                }
                className="erp-module-input mt-1"
              >
                <option value="PJ">PJ</option>
                <option value="PF">PF</option>
              </select>
            </label>
            <label className="relative block text-xs font-medium text-[var(--erp-fg-muted)] sm:col-span-2">
              Pessoa
              <input
                value={personSearch}
                onChange={(e) => {
                  setPersonSearch(e.target.value);
                  setPersonPickerOpen(true);
                }}
                onBlur={() => {
                  window.setTimeout(() => setPersonPickerOpen(false), 150);
                }}
                onFocus={() => setPersonPickerOpen(true)}
                placeholder="Buscar cliente ou lead do CRM..."
                className="erp-module-input mt-1"
              />
              {personPickerOpen ? (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[var(--erp-border)] bg-white shadow-lg">
                  {personLoading ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--erp-fg-muted)]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Buscando...
                    </div>
                  ) : personResults.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-[var(--erp-fg-muted)]">
                      Nenhum resultado
                    </div>
                  ) : (
                    personResults.map((person) => (
                      <button
                        key={`${person.source}-${person.id}`}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectPerson(person)}
                        className="erp-focus-ring flex w-full items-start gap-2 border-b border-[var(--erp-border)]/60 px-3 py-2 text-left hover:bg-[var(--erp-bg-hover)]"
                      >
                        <span
                          className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            person.source === 'CRM'
                              ? 'bg-[#2AACE2]/15 text-[#2AACE2]'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {person.source === 'CRM' ? 'CRM' : 'Cadastro'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[var(--erp-fg)]">
                            {person.name}
                          </span>
                          <span className="block truncate text-xs text-[var(--erp-fg-muted)]">
                            {[person.email, person.phone, person.document]
                              .filter(Boolean)
                              .join(' · ') || 'Sem contato'}
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
              <input
                value={form.customerName}
                onChange={(e) => {
                  setField('customerName', e.target.value);
                  setField('customerId', '');
                  setField('linkedCrmCardId', '');
                }}
                placeholder="Nome do cliente"
                className="erp-module-input mt-1"
              />
              {form.linkedCrmCardId ? (
                <p className="mt-1 text-[11px] font-medium text-[#2AACE2]">
                  Lead CRM vinculado automaticamente
                </p>
              ) : null}
            </label>
            <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
              Responsável
              <select
                value={form.responsibleUserId}
                onChange={(e) => setField('responsibleUserId', e.target.value)}
                className="erp-module-input mt-1"
              >
                <option value="">Sem responsável</option>
                {props.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
              E-mail
              <input
                value={form.customerEmail}
                onChange={(e) => setField('customerEmail', e.target.value)}
                className="erp-module-input mt-1"
              />
            </label>
            <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
              Telefone
              <input
                value={form.customerPhone}
                onChange={(e) => setField('customerPhone', e.target.value)}
                className="erp-module-input mt-1"
              />
            </label>
            <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
              CPF/CNPJ
              <input
                value={form.customerDocument}
                onChange={(e) => setField('customerDocument', e.target.value)}
                className="erp-module-input mt-1"
              />
            </label>
          </div>
        </div>

        {currentQuote ? (
          <CrmOrcamentoProductsSection
            quote={{
              ...currentQuote,
              // Garante que o rateio use o Difal/outros do formulário (não um snapshot desatualizado)
              difalValue: form.difalValue,
              otherExtraCosts: form.otherExtraCosts,
            }}
            onQuoteChange={(quote) => {
              setCurrentQuote(quote);
              setForm((prev) => ({
                ...prev,
                subtotal: quote.subtotal,
                total: quote.total,
                difalValue: quote.difalValue ?? prev.difalValue,
                otherExtraCosts: quote.otherExtraCosts ?? prev.otherExtraCosts,
              }));
            }}
            onError={setError}
          />
        ) : (
          <div className="rounded-xl border border-[var(--erp-border)] bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[var(--erp-fg)]">Produtos</h3>
              <button
                type="button"
                disabled={saving}
                onClick={() => void ensureSavedForProducts()}
                className="erp-focus-ring erp-btn erp-btn-primary erp-btn--md disabled:opacity-50"
              >
                {saving ? <Loader2 className="erp-icon-sm animate-spin" /> : null}
                Salvar para adicionar produtos
              </button>
            </div>
            <p className="text-sm text-[var(--erp-fg-muted)]">
              Salve o orçamento primeiro para liberar a busca no catálogo e a inclusão de
              itens.
            </p>
          </div>
        )}

        <div className="rounded-xl border border-[var(--erp-border)] bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-[var(--erp-fg)]">Observações</h3>
          <CrmOrcamentoRichText
            value={form.observations}
            onChange={(html) => setField('observations', html)}
            placeholder="Observações internas..."
          />
          <label className="mt-3 block text-xs font-medium text-[var(--erp-fg-muted)]">
            Observações do cliente
            <textarea
              value={form.customerNotes}
              onChange={(e) => setField('customerNotes', e.target.value)}
              rows={3}
              className="erp-module-input mt-1 resize-y"
            />
          </label>
        </div>

        {showSalesMargin ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-4 shadow-sm">
            <h3 className="mb-1 text-sm font-semibold text-rose-900">
              Margem de Venda (confidencial)
            </h3>
            <p className="mb-3 text-[11px] text-rose-800/80">
              Margem por dentro sobre o custo (comissão + reserva + margem).
              Visível apenas para você. O percentual não entra no PDF; o preço
              final dos itens já inclui esta margem para todos.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
                Margem de Venda (%)
                <input
                  type="number"
                  min={0}
                  step="0.000001"
                  value={form.salesMarginPercent}
                  onChange={(e) =>
                    handlePricingFieldChange(
                      'salesMarginPercent',
                      e.target.value,
                    )
                  }
                  onBlur={() =>
                    void persistPricingRates(
                      form.commissionPercent,
                      form.marginReservePercent,
                      form.salesMarginPercent,
                    )
                  }
                  className="erp-module-input mt-1"
                />
              </label>
            </div>
            {salesMarginHint ? (
              <p className="mt-3 text-sm text-rose-900">
                Margem de venda no subtotal:{' '}
                <strong>
                  {salesMarginHint.salesPct.toFixed(2)}% ≈{' '}
                  {formatQuoteCurrency(salesMarginHint.amount)}
                </strong>
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-xl border border-[var(--erp-border)] bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-[var(--erp-fg)]">
            Comissão e reserva
          </h3>
          <p className="mb-3 text-[11px] text-[var(--erp-fg-muted)]">
            Entram no preço unitário final de cada item junto com a margem de
            venda (por dentro): (produto + gravação + extras/qtd) ÷ (1 −
            (comissão% + reserva% + margem venda%) / 100).
            {pricingBusy ? ' Recalculando…' : ''}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
              Comissão (%)
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.commissionPercent}
                onChange={(e) =>
                  handlePricingFieldChange('commissionPercent', e.target.value)
                }
                onBlur={() =>
                  void persistPricingRates(
                    form.commissionPercent,
                    form.marginReservePercent,
                  )
                }
                className="erp-module-input mt-1"
              />
            </label>
            <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
              Margem de Reserva (%)
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.marginReservePercent}
                onChange={(e) =>
                  handlePricingFieldChange(
                    'marginReservePercent',
                    e.target.value,
                  )
                }
                onBlur={() =>
                  void persistPricingRates(
                    form.commissionPercent,
                    form.marginReservePercent,
                  )
                }
                className="erp-module-input mt-1"
              />
            </label>
          </div>

          <h4 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--erp-fg-muted)]">
            Extras
          </h4>
          <p className="mb-3 text-[11px] text-[var(--erp-fg-muted)]">
            Valores únicos somados uma vez ao total do orçamento (não por item).
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
              Difal e Substituição Tributária (R$)
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.difalValue}
                onChange={(e) =>
                  handleExtrasChange('difalValue', e.target.value)
                }
                onBlur={() =>
                  void persistExtras(form.difalValue, form.otherExtraCosts)
                }
                className="erp-module-input mt-1"
              />
            </label>
            <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
              Outros Custos Extras (R$)
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.otherExtraCosts}
                onChange={(e) =>
                  handleExtrasChange('otherExtraCosts', e.target.value)
                }
                onBlur={() =>
                  void persistExtras(form.difalValue, form.otherExtraCosts)
                }
                className="erp-module-input mt-1"
              />
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--erp-border)] bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-[var(--erp-fg)]">Pagamento</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
              Subtotal
              <input
                value={formatQuoteCurrency(displaySubtotal)}
                readOnly
                className="erp-module-input mt-1 bg-[var(--erp-bg)]"
              />
            </label>
            <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
              Total
              <input
                value={formatQuoteCurrency(displayTotal)}
                readOnly
                className="erp-module-input mt-1 bg-[var(--erp-bg)]"
              />
            </label>
            <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
              Condição pagamento
              <input
                value={form.paymentTerms}
                onChange={(e) => setField('paymentTerms', e.target.value)}
                className="erp-module-input mt-1"
              />
            </label>
            <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
              Forma pagamento
              <input
                value={form.paymentMethod}
                onChange={(e) => setField('paymentMethod', e.target.value)}
                className="erp-module-input mt-1"
              />
            </label>
          </div>
        </div>
      </div>
      ) : null}

      {sendModal && currentQuote ? (
        <CrmOrcamentoSendProposalModal
          open
          quoteId={currentQuote.id}
          proposalId={sendModal.proposalId}
          defaultEmail={form.customerEmail || currentQuote.customerEmail || ''}
          defaultContactName={
            form.customerName || currentQuote.customerName || ''
          }
          onClose={() => setSendModal(null)}
          onSent={() => {
            setProposalsRefresh((v) => v + 1);
            setFormTab('propostas');
          }}
        />
      ) : null}
    </section>
  );
}
