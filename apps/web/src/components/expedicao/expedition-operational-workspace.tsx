'use client';

/* eslint-disable react-hooks/set-state-in-effect -- sync tab/filtros com fetch */

import { ChevronRight, Loader2, Plus, Search, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { GlowButton } from '@/src/components/shell/glow-button';
import { GlassCard } from '@/src/components/shell/glass-card';
import { ExpeditionWorkspace } from '@/src/components/expedicao/workspace/expedition-workspace';
import { formatBrlDisplay } from '@/src/components/expedicao/expedition-wms-layout';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { useCloseOverlaysOnRouteChange } from '@/src/hooks/use-close-overlays-on-route';

type OrderSource =
  | 'WEG_MERCADO_ELETRONICO'
  | 'ECOMMERCE'
  | 'SITE'
  | 'MANUAL';

type OrderStatus =
  | 'NOVO'
  | 'ANALISADO'
  | 'PARCIAL'
  | 'RESERVADO'
  | 'EM_SEPARACAO'
  | 'SEPARADO'
  | 'AGUARDANDO_NF'
  | 'NF_ATRELADA'
  | 'EXPEDIDO'
  | 'FINALIZADO'
  | 'CANCELADO';

type InvoiceStatus =
  | 'NOT_FOUND'
  | 'PENDING'
  | 'INVOICED'
  | 'PARTIAL'
  | 'RECEIVED'
  | 'CHARGE_RECEIPT';

type ExpeditionSummary = {
  totalPedidos: number;
  pedidosWeg: number;
  urgentes: number;
  atrasados: number;
  reservados: number;
  emSeparacao: number;
  aguardandoNf: number;
  faturados: number;
  cobrarRecebimento: number;
  valorTotal: string;
  /** Soma de `reservedQty` nos produtos ativos — pode ausentar em APIs antigas. */
  estoqueReservadoTotal?: string;
  /** Pedidos em ruptura (amostra / heurística da API). */
  rupturaPedidos?: number;
};

type BannerState = { variant: 'error' | 'success'; message: string };

type ToastState = { variant: 'ok' | 'err'; message: string };

type OrderItemDto = {
  id: string;
  lineNumber: number;
  sku: string;
  description: string;
  quantity: number;
  reservedQuantity: number;
  missingQty?: number;
  pickedQty?: number;
  invoicedQty?: number;
  availableAtAnalysis?: number | null;
  stockStatus?: string;
  unit: string | null;
  ncm: string | null;
  unitPrice: string;
  totalPrice: string;
  productId: string | null;
  stockQtyOnHand?: number | null;
  reservedQtyProduct?: number | null;
  availableQty?: number | null;
  stockAvailable: number | null;
  openNeed: number;
  stockCoversOpenNeed: boolean;
  product: {
    id: string;
    name: string;
    sku: string;
    stockQty: number;
    reservedQty?: number;
    availableQty?: number;
  } | null;
};

type OrderDto = {
  id: string;
  source: OrderSource;
  code: string;
  externalOrderNumber: string | null;
  mercadoEletronicoNumber: string | null;
  customerName: string;
  customerDocument: string | null;
  customerCity?: string | null;
  customerState?: string | null;
  receiverName: string | null;
  unloadingPoint: string | null;
  deliveryCnpj: string | null;
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  deliveryState?: string | null;
  notes: string | null;
  status: OrderStatus;
  priority: number;
  mercadoEletronicoStatus: string | null;
  contaAzulStatus: string | null;
  invoiceNumber: string | null;
  invoiceStatus: InvoiceStatus;
  orderDate: string | null;
  requestedDeliveryDate: string | null;
  totalValue: string;
  createdAt: string;
  itemCount: number;
  quantitySum: number;
  physicalReservationActive?: boolean;
  stockReserveBlocked?: boolean;
  missingSkuForReserve?: boolean;
  integralReserveBlocked?: boolean;
  unidadesFaltantes?: number;
  items: OrderItemDto[];
};

type PaginatedOrders = {
  data: OrderDto[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type ProductPick = {
  id: string;
  name: string;
  sku: string;
  stockQty: number;
  price: string;
};


/** Valores de exemplo para fluxo WEG ponta a ponta (Mercado Eletrônico). */
function defaultWegTestHeader() {
  return {
    externalOrderNumber: '4518249493',
    mercadoEletronicoNumber: '61380468',
    customerName: 'Cliente WEG teste',
    customerDocument: '',
    deliveryCnpj: '84.584.994/0007-16',
    receiverName: 'HENRIQUE',
    unloadingPoint: 'MKT',
    orderDate: '',
    requestedDeliveryDate: '',
    notes: '',
  };
}

function defaultWegTestLines(): Array<{
  tempId: string;
  lineNumber: number;
  sku: string;
  description: string;
  quantity: number;
  unit: string;
  ncm: string;
  unitPrice: number;
}> {
  return [
    {
      tempId: crypto.randomUUID(),
      lineNumber: 10,
      sku: '50020124',
      description: 'CADERNO PADRAO BRANDING PAPEL',
      quantity: 50,
      unit: 'UN',
      ncm: '4820.20.00',
      unitPrice: 24.22,
    },
  ];
}



function FieldLegend({ children }: { children: ReactNode }) {
  return <p className="erp-field-legend mb-1">{children}</p>;
}

const FILTER_SELECT_CLASS =
  'erp-input w-full rounded-2xl px-3 py-2.5 text-[13px]';

const FILTER_INPUT_CLASS =
  'erp-input w-full rounded-2xl px-3 py-2.5 text-[13px]';

const FILTER_DATE_CLASS =
  'erp-input w-full rounded-xl px-2 py-2 text-[12px]';

function SearchablePicker(props: {
  label: string;
  endpoint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          setLoading(true);
          const params = new URLSearchParams();
          if (q.trim()) params.set('search', q.trim());
          const path =
            params.toString().length > 0
              ? `${props.endpoint}?${params.toString()}`
              : props.endpoint;
          const raw = await erpFetchJson<string[]>(path);
          if (!ctrl.signal.aborted) setHits(Array.isArray(raw) ? raw : []);
        } catch {
          if (!ctrl.signal.aborted) setHits([]);
        } finally {
          if (!ctrl.signal.aborted) setLoading(false);
        }
      })();
    }, 280);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [open, q, props.endpoint]);

  return (
    <div className="relative min-w-0 w-full">
      <p className="erp-field-legend mb-1">{props.label}</p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="erp-picker-trigger flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-left text-[13px] transition hover:border-[var(--erp-border-focus)]"
      >
        <span className="truncate font-mono text-[12px] text-erp-fg-secondary">
          {props.value.trim() ? props.value : props.placeholder ?? 'Selecionar…'}
        </span>
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-erp-fg-muted transition ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open ? (
        <div className="erp-picker-panel absolute left-0 right-0 top-full z-[200] mt-1 rounded-2xl p-2 backdrop-blur-xl">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-erp-fg-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filtrar lista…"
              className="erp-input w-full rounded-xl py-2 pl-9 pr-3 text-[13px]"
            />
          </div>
          <div className="erp-scrollbar mt-2 max-h-52 overflow-y-auto">
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-4 text-[12px] text-erp-fg-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : hits.length === 0 ? (
              <p className="px-3 py-4 text-[12px] text-erp-fg-muted">Nenhum resultado.</p>
            ) : (
              hits.map((h) => (
                <button
                  key={h}
                  type="button"
                  className="flex w-full truncate rounded-lg px-3 py-2 text-left font-mono text-[12px] text-erp-fg-secondary hover:bg-[var(--erp-accent-soft)]"
                  onClick={() => {
                    props.onChange(h);
                    setOpen(false);
                    setQ('');
                  }}
                >
                  {h}
                </button>
              ))
            )}
          </div>
          <button
            type="button"
            className="mt-2 w-full rounded-lg py-1.5 text-[11px] text-erp-fg-muted hover:bg-[var(--erp-bg-hover)]"
            onClick={() => {
              props.onChange('');
              setOpen(false);
            }}
          >
            Limpar
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ExpeditionOperationalWorkspace() {
  const [banner, setBanner] = useState<BannerState | null>(null);

  const [manualOpen, setManualOpen] = useState(false);
  const [wegOpen, setWegOpen] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [savingWeg, setSavingWeg] = useState(false);

  const [nf, setNf] = useState({
    customerName: '',
    customerDocument: '',
    customerCity: '',
    customerState: '',
    notes: '',
    priority: 3 as number,
  });
  type LineDraft = {
    tempId: string;
    product: ProductPick;
    qty: number;
    unitPriceHint: number | undefined;
  };
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [prodSearch, setProdSearch] = useState('');
  const [prodHits, setProdHits] = useState<ProductPick[]>([]);
  const [prodLoading, setProdLoading] = useState(false);

  const [weg, setWeg] = useState(defaultWegTestHeader);
  type WegLine = {
    tempId: string;
    lineNumber: number;
    sku: string;
    description: string;
    quantity: number;
    unit: string;
    ncm: string;
    unitPrice: number;
  };
  const [wegLines, setWegLines] = useState<WegLine[]>(() =>
    defaultWegTestLines(),
  );

  const closeAllOverlays = useCallback(() => {
    setManualOpen(false);
    setWegOpen(false);
  }, []);

  useCloseOverlaysOnRouteChange(closeAllOverlays);

  useEffect(() => {
    if (!manualOpen && !wegOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAllOverlays();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [manualOpen, wegOpen, closeAllOverlays]);

  useEffect(() => {
    if (!manualOpen) return;
    const q = prodSearch.trim();
    const ctrl = new AbortController();
    const tid = window.setTimeout(() => {
      void (async () => {
        try {
          setProdLoading(true);
          const params = new URLSearchParams({
            page: '1',
            pageSize: '18',
          });
          if (q.length > 1) params.set('search', q);
          params.set('status', 'active');
          const raw = await erpFetchJson<{
            data: Array<{
              id: string;
              name: string;
              sku: string;
              stockQty: number;
              price: string;
            }>;
          }>(`products?${params.toString()}`);
          if (!ctrl.signal.aborted) setProdHits(raw.data);
        } catch {
          if (!ctrl.signal.aborted) setProdHits([]);
        } finally {
          if (!ctrl.signal.aborted) setProdLoading(false);
        }
      })();
    }, 340);
    return () => {
      ctrl.abort();
      clearTimeout(tid);
    };
  }, [manualOpen, prodSearch]);

  const totalsManualPreview = useMemo(() => {
    let sub = 0;
    for (const ln of lines) {
      const p =
        ln.unitPriceHint !== undefined ? ln.unitPriceHint : Number(ln.product.price);
      sub += ln.qty * p;
    }
    return Math.round(sub * 100) / 100;
  }, [lines]);

  const totalsWegPreview = useMemo(() => {
    let sub = 0;
    for (const ln of wegLines) {
      sub += ln.quantity * ln.unitPrice;
    }
    return Math.round(sub * 100) / 100;
  }, [wegLines]);

  async function submitManualOrder() {
    if (!nf.customerName.trim()) {
      setBanner({ variant: 'error', message: 'Informe o cliente.' });
      return;
    }
    if (lines.length === 0) {
      setBanner({
        variant: 'error',
        message: 'Adicione ao menos uma linha de produto.',
      });
      return;
    }
    setSavingManual(true);
    setBanner(null);
    try {
      await erpFetchJson<OrderDto>('orders', {
        method: 'POST',
        body: JSON.stringify({
          customerName: nf.customerName.trim(),
          customerDocument: nf.customerDocument.trim() || undefined,
          customerCity: nf.customerCity.trim() || undefined,
          customerState: nf.customerState.trim() || undefined,
          notes: nf.notes.trim() || undefined,
          priority: nf.priority,
          items: lines.map((l) => ({
            productId: l.product.id,
            quantity: l.qty,
            unitPrice: l.unitPriceHint ?? Number(l.product.price),
          })),
        }),
      });
      setManualOpen(false);
      window.dispatchEvent(new Event('expedition-refresh'));
      setBanner({
        variant: 'success',
        message: 'Pedido manual criado com sucesso.',
      });
    } catch (e) {
      setBanner({
        variant: 'error',
        message:
          e instanceof Error ? e.message : 'Erro ao criar pedido.',
      });
    } finally {
      setSavingManual(false);
    }
  }

  async function submitWegOrder() {
    if (!weg.customerName.trim()) {
      setBanner({
        variant: 'error',
        message: 'Informe o cliente / razão social.',
      });
      return;
    }
    const validLines = wegLines.filter((l) => l.sku.trim() && l.description.trim());
    if (validLines.length === 0) {
      setBanner({
        variant: 'error',
        message: 'Informe ao menos um item com SKU e descrição.',
      });
      return;
    }
    setSavingWeg(true);
    setBanner(null);
    try {
      await erpFetchJson<OrderDto>('orders', {
        method: 'POST',
        body: JSON.stringify({
          externalOrderNumber: weg.externalOrderNumber.trim() || undefined,
          mercadoEletronicoNumber: weg.mercadoEletronicoNumber.trim() || undefined,
          customerName: weg.customerName.trim(),
          customerDocument: weg.customerDocument.trim() || undefined,
          deliveryCnpj: weg.deliveryCnpj.trim() || undefined,
          receiverName: weg.receiverName.trim() || undefined,
          unloadingPoint: weg.unloadingPoint.trim() || undefined,
          orderDate: weg.orderDate.trim() || undefined,
          requestedDeliveryDate: weg.requestedDeliveryDate.trim() || undefined,
          notes: weg.notes.trim() || undefined,
          items: validLines.map((l) => ({
            lineNumber: l.lineNumber,
            sku: l.sku.trim(),
            description: l.description.trim(),
            quantity: l.quantity,
            unit: l.unit.trim() || undefined,
            ncm: l.ncm.trim() || undefined,
            unitPrice: l.unitPrice,
          })),
        }),
      });
      setWegOpen(false);
      window.dispatchEvent(new Event('expedition-refresh'));
      setBanner({
        variant: 'success',
        message: 'Pedido WEG criado com sucesso.',
      });
    } catch (e) {
      setBanner({
        variant: 'error',
        message:
          e instanceof Error ? e.message : 'Erro ao criar pedido WEG.',
      });
    } finally {
      setSavingWeg(false);
    }
  }

  return (
    <>
      <ExpeditionWorkspace
        mode="orders"
        onNewOrder={() => setManualOpen(true)}
      />

      {banner ? (
        <div
          role="status"
          className={`fixed top-24 right-6 z-[180] max-w-sm rounded-xl px-4 py-3 text-sm shadow-lg ${
            banner.variant === 'success'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {banner.message}
        </div>
      ) : null}

      {/* Modal manual */}
      {manualOpen ? (
        <ModalShell title="Novo pedido manual" onClose={() => setManualOpen(false)}>
          <p className="text-[13px] text-erp-fg-muted">
            Fluxo cadastro por produto interno — criado como Manual em NOVO; baixa física só ao&nbsp;
            <strong className="text-erp-fg-secondary">finalizar expedição com NF</strong>.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="col-span-full">
              <span className="text-[11px] uppercase tracking-[0.16em] text-erp-fg-muted">
                Cliente *
              </span>
              <input
                value={nf.customerName}
                onChange={(e) =>
                  setNf((f) => ({ ...f, customerName: e.target.value }))
                }
                className="mt-2 w-full rounded-2xl erp-input w-full px-4 py-3 text-[13px] outline-none focus:border-violet-400/45"
              />
            </label>
            <label>
              <span className="text-[11px] uppercase tracking-[0.16em] text-erp-fg-muted">
                Documento
              </span>
              <input
                value={nf.customerDocument}
                onChange={(e) =>
                  setNf((f) => ({ ...f, customerDocument: e.target.value }))
                }
                className="erp-input mt-2 w-full rounded-2xl px-4 py-3 font-mono text-[13px] outline-none"
              />
            </label>
            <label>
              <span className="text-[11px] uppercase tracking-[0.16em] text-erp-fg-muted">
                UF
              </span>
              <input
                value={nf.customerState}
                maxLength={2}
                onChange={(e) =>
                  setNf((f) => ({
                    ...f,
                    customerState: e.target.value.toUpperCase(),
                  }))
                }
                className="mt-2 w-full rounded-2xl erp-input w-full px-4 py-3 font-mono text-[13px] uppercase outline-none"
              />
            </label>
          </div>
          <textarea
            rows={3}
            value={nf.notes}
            onChange={(e) => setNf((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Observações…"
            className="mt-4 w-full rounded-2xl erp-input w-full px-4 py-3 text-[13px] outline-none"
          />

          <div className="mt-8 border-t border-erp-border pt-6">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-erp-fg-muted">
              Produtos
            </p>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-erp-fg-muted" />
              <input
                value={prodSearch}
                onChange={(e) => setProdSearch(e.target.value)}
                placeholder="Buscar SKU…"
                className="erp-input w-full rounded-2xl py-3 pl-11 pr-4 text-[13px] outline-none"
              />
              {prodLoading ? (
                <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-erp-fg-muted" />
              ) : null}
            </div>
            <div className="erp-scrollbar mt-2 max-h-36 overflow-y-auto rounded-xl border border-erp-border">
              {prodHits.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-full justify-between gap-3 border-b border-erp-border px-4 py-2 text-left text-[13px] text-erp-fg-secondary hover:bg-[var(--erp-bg-hover)]"
                  onClick={() =>
                    setLines((xs) => [
                      ...xs,
                      {
                        tempId: crypto.randomUUID(),
                        product: p,
                        qty: 1,
                        unitPriceHint: Number(p.price),
                      },
                    ])
                  }
                >
                  <span>{p.name}</span>
                  <span className="font-mono text-[12px] text-erp-fg-muted">{p.sku}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              {lines.map((ln) => (
                <div
                  key={ln.tempId}
                  className="erp-order-line-card flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-erp-fg">{ln.product.name}</p>
                    <p className="font-mono text-[12px] text-erp-fg-muted">{ln.product.sku}</p>
                  </div>
                  <label className="flex items-center gap-2 text-[12px] text-erp-fg-muted">
                    Qtd
                    <input
                      type="number"
                      min={1}
                      value={ln.qty}
                      onChange={(e) =>
                        setLines((xs) =>
                          xs.map((l) =>
                            l.tempId === ln.tempId
                              ? {
                                  ...l,
                                  qty: Math.max(1, Number(e.target.value) || 1),
                                }
                              : l,
                          ),
                        )
                      }
                      className="erp-input w-20 rounded-lg px-2 py-1 font-mono"
                    />
                  </label>
                  <button
                    type="button"
                    className="text-[12px] text-[var(--erp-danger)] hover:text-erp-fg"
                    onClick={() =>
                      setLines((xs) => xs.filter((l) => l.tempId !== ln.tempId))
                    }
                  >
                    remover
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-erp-border pt-6">
            <p className="font-mono text-lg text-emerald-100">
              {formatBrlDisplay(totalsManualPreview.toFixed(2))}
            </p>
            <GlowButton
              variant="primary"
              disabled={savingManual || !nf.customerName.trim() || lines.length === 0}
              onClick={() => void submitManualOrder()}
            >
              {savingManual ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Salvando…
                </>
              ) : (
                'Salvar pedido'
              )}
            </GlowButton>
          </div>
        </ModalShell>
      ) : null}

      {/* Modal WEG */}
      {wegOpen ? (
        <ModalShell title="Novo pedido WEG teste" onClose={() => setWegOpen(false)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="lg:col-span-1">
              <span className="text-[11px] uppercase tracking-[0.16em] text-erp-fg-muted">
                Número pedido WEG
              </span>
              <input
                placeholder="4518249493"
                value={weg.externalOrderNumber}
                onChange={(e) =>
                  setWeg((w) => ({ ...w, externalOrderNumber: e.target.value }))
                }
                className="mt-2 w-full rounded-2xl erp-input w-full px-4 py-2.5 font-mono text-[13px] outline-none"
              />
            </label>
            <label>
              <span className="text-[11px] uppercase tracking-[0.16em] text-erp-fg-muted">
                Número ME
              </span>
              <input
                placeholder="61380468"
                value={weg.mercadoEletronicoNumber}
                onChange={(e) =>
                  setWeg((w) => ({ ...w, mercadoEletronicoNumber: e.target.value }))
                }
                className="mt-2 w-full rounded-2xl erp-input w-full px-4 py-2.5 font-mono text-[13px] outline-none"
              />
            </label>
            <label className="col-span-full">
              <span className="text-[11px] uppercase tracking-[0.16em] text-erp-fg-muted">
                Cliente / razão social *
              </span>
              <input
                placeholder="Cliente WEG teste"
                value={weg.customerName}
                onChange={(e) =>
                  setWeg((w) => ({ ...w, customerName: e.target.value }))
                }
                className="mt-2 w-full rounded-2xl erp-input w-full px-4 py-2.5 text-[13px] outline-none"
              />
            </label>
            <label>
              <span className="text-[11px] uppercase tracking-[0.16em] text-erp-fg-muted">
                CNPJ entrega
              </span>
              <input
                placeholder="84.584.994/0007-16"
                value={weg.deliveryCnpj}
                onChange={(e) =>
                  setWeg((w) => ({ ...w, deliveryCnpj: e.target.value }))
                }
                className="mt-2 w-full rounded-2xl erp-input w-full px-4 py-2.5 font-mono text-[13px] outline-none"
              />
            </label>
            <label>
              <span className="text-[11px] uppercase tracking-[0.16em] text-erp-fg-muted">
                Recebedor
              </span>
              <input
                placeholder="HENRIQUE"
                value={weg.receiverName}
                onChange={(e) =>
                  setWeg((w) => ({ ...w, receiverName: e.target.value }))
                }
                className="mt-2 w-full rounded-2xl erp-input w-full px-4 py-2.5 text-[13px] outline-none"
              />
            </label>
            <label className="col-span-full">
              <span className="text-[11px] uppercase tracking-[0.16em] text-erp-fg-muted">
                Ponto descarga
              </span>
              <input
                placeholder="MKT"
                value={weg.unloadingPoint}
                onChange={(e) =>
                  setWeg((w) => ({ ...w, unloadingPoint: e.target.value }))
                }
                className="mt-2 w-full rounded-2xl erp-input w-full px-4 py-2.5 text-[13px] outline-none"
              />
            </label>
            <label>
              <span className="text-[11px] uppercase tracking-[0.16em] text-erp-fg-muted">
                Data pedido
              </span>
              <input
                type="date"
                value={weg.orderDate}
                onChange={(e) =>
                  setWeg((w) => ({ ...w, orderDate: e.target.value }))
                }
                className="mt-2 w-full rounded-2xl erp-input w-full px-4 py-2.5 text-[13px] outline-none"
              />
            </label>
            <label>
              <span className="text-[11px] uppercase tracking-[0.16em] text-erp-fg-muted">
                Data entrega
              </span>
              <input
                type="date"
                value={weg.requestedDeliveryDate}
                onChange={(e) =>
                  setWeg((w) => ({
                    ...w,
                    requestedDeliveryDate: e.target.value,
                  }))
                }
                className="mt-2 w-full rounded-2xl erp-input w-full px-4 py-2.5 text-[13px] outline-none"
              />
            </label>
            <label className="col-span-full">
              <span className="text-[11px] uppercase tracking-[0.16em] text-erp-fg-muted">
                Observação
              </span>
              <textarea
                rows={3}
                placeholder="Observações do pedido…"
                value={weg.notes}
                onChange={(e) => setWeg((w) => ({ ...w, notes: e.target.value }))}
                className="mt-2 w-full rounded-2xl erp-input w-full px-4 py-3 text-[13px] outline-none"
              />
            </label>
          </div>

          <div className="mt-8 border-t border-erp-border pt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-erp-fg-muted">
                Itens (linha WEG)
              </p>
              <GlowButton
                variant="secondary"
                type="button"
                className="py-2 text-[12px]"
                onClick={() =>
                  setWegLines((xs) => [
                    ...xs,
                    {
                      tempId: crypto.randomUUID(),
                      lineNumber:
                        Math.max(0, ...xs.map((l) => l.lineNumber)) + 10,
                      sku: '',
                      description: '',
                      quantity: 1,
                      unit: 'UN',
                      ncm: '',
                      unitPrice: 0,
                    },
                  ])
                }
              >
                + Linha
              </GlowButton>
            </div>
            <div className="space-y-3">
              {wegLines.map((ln) => (
                <GlassCard key={ln.tempId} className="grid gap-3 p-4 sm:grid-cols-12">
                  <label className="sm:col-span-2">
                    <span className="text-[10px] uppercase text-erp-fg-muted">Linha</span>
                    <input
                      type="number"
                      value={ln.lineNumber}
                      onChange={(e) =>
                        setWegLines((xs) =>
                          xs.map((l) =>
                            l.tempId === ln.tempId
                              ? {
                                  ...l,
                                  lineNumber: Math.max(
                                    1,
                                    Number(e.target.value) || 1,
                                  ),
                                }
                              : l,
                          ),
                        )
                      }
                      className="erp-input mt-1 w-full rounded-xl px-2 py-2 font-mono text-[13px]"
                    />
                  </label>
                  <label className="sm:col-span-4">
                    <span className="text-[10px] uppercase text-erp-fg-muted">SKU</span>
                    <input
                      value={ln.sku}
                      onChange={(e) =>
                        setWegLines((xs) =>
                          xs.map((l) =>
                            l.tempId === ln.tempId
                              ? { ...l, sku: e.target.value }
                              : l,
                          ),
                        )
                      }
                      className="erp-input mt-1 w-full rounded-xl px-2 py-2 font-mono text-[13px]"
                    />
                  </label>
                  <label className="sm:col-span-6">
                    <span className="text-[10px] uppercase text-erp-fg-muted">
                      Descrição
                    </span>
                    <input
                      value={ln.description}
                      onChange={(e) =>
                        setWegLines((xs) =>
                          xs.map((l) =>
                            l.tempId === ln.tempId
                              ? { ...l, description: e.target.value }
                              : l,
                          ),
                        )
                      }
                      className="erp-input mt-1 w-full rounded-xl px-2 py-2 text-[13px]"
                    />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="text-[10px] uppercase text-erp-fg-muted">Qtd</span>
                    <input
                      type="number"
                      min={1}
                      value={ln.quantity}
                      onChange={(e) =>
                        setWegLines((xs) =>
                          xs.map((l) =>
                            l.tempId === ln.tempId
                              ? {
                                  ...l,
                                  quantity: Math.max(
                                    1,
                                    Number(e.target.value) || 1,
                                  ),
                                }
                              : l,
                          ),
                        )
                      }
                      className="erp-input mt-1 w-full rounded-xl px-2 py-2 font-mono text-[13px]"
                    />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="text-[10px] uppercase text-erp-fg-muted">Un</span>
                    <input
                      value={ln.unit}
                      onChange={(e) =>
                        setWegLines((xs) =>
                          xs.map((l) =>
                            l.tempId === ln.tempId
                              ? { ...l, unit: e.target.value }
                              : l,
                          ),
                        )
                      }
                      className="erp-input mt-1 w-full rounded-xl px-2 py-2 text-[13px]"
                    />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="text-[10px] uppercase text-erp-fg-muted">NCM</span>
                    <input
                      value={ln.ncm}
                      onChange={(e) =>
                        setWegLines((xs) =>
                          xs.map((l) =>
                            l.tempId === ln.tempId
                              ? { ...l, ncm: e.target.value }
                              : l,
                          ),
                        )
                      }
                      className="erp-input mt-1 w-full rounded-xl px-2 py-2 font-mono text-[13px]"
                    />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="text-[10px] uppercase text-erp-fg-muted">
                      P.unitário
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={ln.unitPrice}
                      onChange={(e) =>
                        setWegLines((xs) =>
                          xs.map((l) =>
                            l.tempId === ln.tempId
                              ? {
                                  ...l,
                                  unitPrice: Math.max(
                                    0,
                                    Number(e.target.value) || 0,
                                  ),
                                }
                              : l,
                          ),
                        )
                      }
                      className="erp-input mt-1 w-full rounded-xl px-2 py-2 font-mono text-[13px]"
                    />
                  </label>
                  <div className="flex flex-col justify-end sm:col-span-4">
                    <span className="text-[10px] uppercase text-erp-fg-muted">
                      Total linha
                    </span>
                    <p className="mt-1 font-mono text-[14px] font-semibold text-emerald-100">
                      {formatBrlDisplay(
                        (Math.round(ln.quantity * ln.unitPrice * 100) / 100).toFixed(
                          2,
                        ),
                      )}
                    </p>
                  </div>
                  <div className="flex items-end justify-end sm:col-span-12">
                    <button
                      type="button"
                      className="text-[12px] text-[var(--erp-danger)] hover:text-erp-fg"
                      onClick={() =>
                        setWegLines((xs) => xs.filter((l) => l.tempId !== ln.tempId))
                      }
                    >
                      remover linha
                    </button>
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-erp-border pt-6">
            <p className="font-mono text-lg text-emerald-100">
              Total {formatBrlDisplay(totalsWegPreview.toFixed(2))}
            </p>
            <GlowButton
              variant="primary"
              disabled={
                savingWeg ||
                !weg.customerName.trim() ||
                wegLines.every((l) => !l.sku.trim())
              }
              onClick={() => void submitWegOrder()}
            >
              {savingWeg ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Salvando…
                </>
              ) : (
                'Salvar pedido WEG'
              )}
            </GlowButton>
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}

function ModalShell(props: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const { title, children, onClose } = props;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="presentation"
      className="erp-overlay fixed inset-0 z-[160] flex items-center justify-center p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div className="relative w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <GlassCard glow="blue" className="relative max-h-[92vh] w-full overflow-y-auto p-8 [scrollbar-width:thin]">
          <button
            type="button"
            aria-label="Fechar"
            className="erp-icon-btn absolute right-6 top-6 rounded-lg p-2"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
          <p className="text-xl font-semibold text-erp-fg">{title}</p>
          <div className="mt-6">{children}</div>
        </GlassCard>
      </div>
    </div>
  );
}
