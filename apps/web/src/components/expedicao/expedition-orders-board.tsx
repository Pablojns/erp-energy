'use client';

import type { MouseEvent } from 'react';
import {
  ArrowDownToLine,
  ChevronDown,
  ChevronRight,
  Check,
  CheckCircle2,
  ClipboardList as IconClipboardList,
  Loader2,
  Package,
  Receipt,
  Truck,
  X,
  Zap,
} from 'lucide-react';
import { GlowButton } from '@/src/components/shell/glow-button';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { ExpeditionPickedQtyControl } from '@/src/components/expedicao/expedition-picked-qty-control';
import {
  ExpeditionDetailSection,
  ExpeditionDetailTile,
  ExpeditionGlowBadge,
  buildExpeditionOrderBadges,
  buildObservationBlocks,
  displayOrDash,
  type ExpeditionOrderStatus,
} from '@/src/components/expedicao/expedition-order-ux';
import {
  SOURCE_LABEL,
  STATUS_META,
  cardGlowForExpeditionOrder,
  formatBrlDisplay,
  formatDayDisplay,
  itemStockLabelShared,
  orderSeparationProgress,
} from '@/src/components/expedicao/expedition-wms-layout';



/** Aba acoplada ao workspace de Expedição. */
export type ExpeditionOrdersBoardTab =
  | 'todos'
  | 'separacao'
  | 'aguardandoNf'
  | 'finalizados'
  | 'pendencias';

type OrderSource =
  | 'WEG_MERCADO_ELETRONICO'
  | 'ECOMMERCE'
  | 'SITE'
  | 'MANUAL';

type OrderStatus = ExpeditionOrderStatus;


type InvoiceStatus =
  | 'NOT_FOUND'
  | 'PENDING'
  | 'INVOICED'
  | 'PARTIAL'
  | 'RECEIVED'
  | 'CHARGE_RECEIPT';

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

type Meta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
} | null;

export function ExpeditionOrdersBoard(props: {
  mode?: 'expedition' | 'separation';
  listTitle?: string;
  orders: OrderDto[];
  ordersLoading: boolean;
  meta: Meta;
  page: number;
  setPage: (n: number | ((p: number) => number)) => void;
  expandedOrderId: string | null;
  setExpandedOrderId: (id: string | null) => void;
  reservingOrderId: string | null;
  reserveOrder: (id: string) => void;
  sendToPicking: (id: string) => void;
  markPicked: (id: string) => void;
  attachInvoiceOrder: (id: string) => void;
  finalizeExpeditionOrder: (id: string) => void;
  confirmCancelOrder: (order: OrderDto) => void;
  patchOrderStatus: (id: string, status: OrderStatus) => void | Promise<void>;
  toggleOrderUrgent: (order: OrderDto) => void | Promise<void>;
  markLineSeparated: (
    orderId: string,
    itemId: string,
    qtyLine: number,
  ) => void | Promise<void>;
  markAllSeparatedFromReserved: (orderId: string) => void | Promise<void>;
  refreshAll: () => Promise<void>;
  onToast: (v: { variant: 'ok' | 'err'; message: string }) => void;
}) {
  const {
    mode = 'expedition',
    listTitle = 'Lista de pedidos',
    orders,
    ordersLoading,
    meta,
    page,
    setPage,
    expandedOrderId,
    setExpandedOrderId,
    reservingOrderId,
    reserveOrder,
    sendToPicking,
    markPicked,
    attachInvoiceOrder,
    finalizeExpeditionOrder,
    confirmCancelOrder,
    patchOrderStatus,
    toggleOrderUrgent,
    markLineSeparated,
    markAllSeparatedFromReserved,
    refreshAll,
    onToast,
  } = props;

  function toggleExpand(id: string) {
    setExpandedOrderId(expandedOrderId === id ? null : id);
  }

  function stopCardAction(e: MouseEvent) {
    e.stopPropagation();
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-erp-border pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Package className="h-5 w-5 text-[var(--erp-accent)]" aria-hidden />
            <h2 className="text-[18px] font-semibold tracking-tight text-erp-fg">
              {listTitle}
            </h2>
          </div>
          {meta ? (
            <p className="mt-1 text-[13px] text-erp-fg-muted">
              Página{' '}
              <span className="font-mono text-erp-fg-secondary">
                {meta.page}/{meta.totalPages}
              </span>{' '}
              ·{' '}
              <span className="font-semibold text-erp-fg-muted">
                {meta.total.toLocaleString('pt-BR')}
              </span>{' '}
              pedidos
            </p>
          ) : null}
        </div>
        {meta && meta.totalPages > 1 ? (
          <div className="flex flex-wrap gap-2">
            <GlowButton
              variant="secondary"
              type="button"
              disabled={page <= 1 || ordersLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="min-h-[44px] px-4"
            >
              Anterior
            </GlowButton>
            <GlowButton
              variant="secondary"
              type="button"
              disabled={ordersLoading || page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="min-h-[44px] px-4"
            >
              Próxima
            </GlowButton>
          </div>
        ) : null}
      </div>

      {ordersLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="erp-skeleton h-32 rounded-3xl border border-erp-border"
            />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="erp-surface rounded-3xl border border-dashed border-erp-border px-6 py-20 text-center">
          <IconClipboardList className="mx-auto mb-4 h-10 w-10 text-erp-fg-subtle" aria-hidden />
          <p className="text-[15px] font-medium text-erp-fg-muted">Nenhum pedido nesta aba.</p>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-erp-fg-subtle">
            Combine outra aba, limpe filtros ou ajuste a busca global para ampliar o resultado.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => {
            const expanded = expandedOrderId === o.id;
            const sm = STATUS_META[o.status];
            const prog = orderSeparationProgress(o);
            const uf = o.unidadesFaltantes ?? 0;
            const urgentFlag = o.priority <= 2;
            const numero = o.externalOrderNumber ?? o.code;
            const canAnalyze = o.status === 'NOVO' || o.status === 'PARCIAL';
            const canSendSep =
              o.status === 'RESERVADO' || o.status === 'PARCIAL';
            const canMarkPartial = o.status === 'NOVO';
            const canMarkPendency = o.status === 'SEPARADO';
            const canAttachNf =
              o.status === 'SEPARADO' || o.status === 'AGUARDANDO_NF';
            const canFinalizeSep = o.status === 'EM_SEPARACAO';
            const isTerminal =
              o.status === 'FINALIZADO' || o.status === 'CANCELADO';
            const flagBadges = buildExpeditionOrderBadges(o);
            const { blocks: observationBlocks, hasAny: hasObservations } =
              buildObservationBlocks(o);
            const deliveryCity = o.deliveryCity ?? o.customerCity;
            const deliveryState = o.deliveryState ?? o.customerState;

            return (
              <div
                key={o.id}
                className={`overflow-hidden rounded-3xl backdrop-blur-md ${cardGlowForExpeditionOrder(o.status)}`}
              >
                <button
                  type="button"
                  aria-expanded={expanded}
                  className="flex w-full flex-col gap-4 p-5 text-left transition hover:bg-[var(--erp-bg-hover)] sm:flex-row sm:items-start sm:justify-between"
                  onClick={() => toggleExpand(o.id)}
                >
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-start gap-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-erp-fg-subtle">
                          Pedido · {SOURCE_LABEL[o.source]}
                        </p>
                        <p className="mt-1 break-all font-mono text-xl font-bold tracking-tight text-erp-fg">
                          {numero}
                        </p>
                        <p className="mt-1 truncate text-[14px] font-medium text-erp-fg-secondary">
                          {o.customerName}
                        </p>
                      </div>
                      {!expanded ? (
                        <>
                          <StatusBadge label={sm.label} tone={sm.tone} />
                          {flagBadges
                            .filter((b) => b.key !== 'status')
                            .map((b) => (
                              <ExpeditionGlowBadge
                                key={b.key}
                                label={b.label}
                                tone={b.tone}
                                size="sm"
                              />
                            ))}
                          {uf > 0 ? (
                            <ExpeditionGlowBadge
                              label={`Falta ${uf.toLocaleString('pt-BR')} un.`}
                              tone="warning"
                              size="sm"
                            />
                          ) : null}
                        </>
                      ) : null}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                      <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-erp-fg-muted">
                          CNPJ de entrega
                        </p>
                        <p className="mt-1 break-all font-mono text-[13px] text-erp-fg-secondary">
                          {o.deliveryCnpj ?? '—'}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-erp-fg-muted">
                          Recebedor
                        </p>
                        <p className="mt-1 truncate text-[14px] text-erp-fg-secondary">
                          {o.receiverName ?? '—'}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-erp-fg-muted">
                          Ponto de descarga
                        </p>
                        <p className="mt-1 truncate text-[14px] text-erp-fg-secondary">
                          {o.unloadingPoint ?? '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-erp-fg-muted">
                          Linhas · Qtd total
                        </p>
                        <p className="mt-1 font-mono text-[14px] text-erp-fg">
                          {o.itemCount} · {o.quantitySum.toLocaleString('pt-BR')} un.
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-erp-fg-muted">
                          Valor estimado
                        </p>
                        <p className="mt-1 font-mono text-[14px] text-[var(--erp-success)]">
                          {formatBrlDisplay(o.totalValue)}
                        </p>
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between text-[11px] text-erp-fg-muted">
                        <span>Separação</span>
                        <span className="font-mono text-erp-fg-muted">
                          {prog.picked.toLocaleString('pt-BR')} /{' '}
                          {prog.target.toLocaleString('pt-BR')} un. ({prog.pct}%)
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[var(--erp-bg-muted)]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400 transition-[width] duration-500"
                          style={{ width: `${Math.min(100, prog.pct)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2 sm:w-44">
                    {urgentFlag ? (
                      <span className="erp-sla-badge">SLA urgente</span>
                    ) : null}
                    {expanded ? (
                      <ChevronDown className="h-6 w-6 text-[var(--erp-accent)]" aria-hidden />
                    ) : (
                      <ChevronRight className="h-6 w-6 text-erp-fg-muted" aria-hidden />
                    )}
                    {!expanded ? (
                      <span className="text-[11px] text-erp-fg-subtle">Expandir</span>
                    ) : null}
                  </div>
                </button>

                {!expanded ? (
                  <div
                    className="erp-muted-bar flex flex-wrap items-center gap-2 px-5 py-3"
                    onClick={stopCardAction}
                    role="presentation"
                  >
                    <button
                      type="button"
                      className={`erp-chip-btn px-3 py-2 ${urgentFlag ? 'erp-chip-btn--accent' : ''}`}
                      onClick={() => void toggleOrderUrgent(o)}
                    >
                      <Zap className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
                      Urgente
                    </button>
                    {canMarkPartial ? (
                      <button
                        type="button"
                        className="rounded-xl border border-erp-border bg-[var(--erp-bg-input)] px-3 py-2 text-[11px] font-semibold text-erp-fg-secondary transition hover:bg-[var(--erp-bg-hover)]"
                        onClick={() => void patchOrderStatus(o.id, 'PARCIAL')}
                      >
                        Parcial
                      </button>
                    ) : null}
                    {canMarkPendency ? (
                      <button
                        type="button"
                        className="rounded-xl border border-erp-border bg-[var(--erp-bg-input)] px-3 py-2 text-[11px] font-semibold text-erp-fg-secondary transition hover:bg-[var(--erp-bg-hover)]"
                        onClick={() =>
                          void patchOrderStatus(o.id, 'AGUARDANDO_NF')
                        }
                      >
                        Pendência
                      </button>
                    ) : null}
                    {canSendSep ? (
                      <button
                        type="button"
                        className="erp-chip-btn erp-chip-btn--violet px-3 py-2"
                        onClick={() => void sendToPicking(o.id)}
                      >
                        <ArrowDownToLine className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
                        Separação
                      </button>
                    ) : null}
                    {canAnalyze ? (
                      <button
                        type="button"
                        disabled={reservingOrderId === o.id}
                        className="erp-chip-btn erp-chip-btn--success px-3 py-2 disabled:opacity-50"
                        onClick={() => void reserveOrder(o.id)}
                      >
                        {reservingOrderId === o.id ? (
                          <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Zap className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
                        )}
                        Reservar
                      </button>
                    ) : null}
                    <GlowButton
                      variant="secondary"
                      type="button"
                      className="ml-auto min-h-[40px] justify-center px-4 text-[13px] font-semibold"
                      onClick={() => toggleExpand(o.id)}
                    >
                      <ChevronRight className="mr-1.5 h-4 w-4" aria-hidden />
                      Detalhes
                    </GlowButton>
                  </div>
                ) : null}

                {expanded ? (
                  <div className="erp-panel erp-order-expand px-5 py-6">
                    <div
                      className="flex flex-col gap-4 border-b border-erp-border pb-5"
                      onClick={stopCardAction}
                      role="presentation"
                    >
                      <div className="flex flex-wrap items-center gap-2.5">
                        {flagBadges.map((b) => (
                          <ExpeditionGlowBadge
                            key={b.key}
                            label={b.label}
                            tone={b.tone}
                            size="lg"
                          />
                        ))}
                        {uf > 0 ? (
                          <ExpeditionGlowBadge
                            label={`Falta ${uf.toLocaleString('pt-BR')} un.`}
                            tone="warning"
                            size="lg"
                          />
                        ) : null}
                      </div>

                      <div className="-mx-1 flex flex-wrap gap-2 overflow-x-auto pb-1">
                        {mode === 'separation' ? (
                          <GlowButton
                            variant="primary"
                            type="button"
                            className="min-h-[44px] shrink-0 justify-center gap-2 px-4 text-[13px] font-semibold"
                            onClick={() =>
                              void markAllSeparatedFromReserved(o.id)
                            }
                          >
                            <CheckCircle2 className="h-4 w-4" aria-hidden />
                            Marcar todos separados
                          </GlowButton>
                        ) : null}
                        {canSendSep ? (
                          <GlowButton
                            variant="primary"
                            type="button"
                            className="min-h-[44px] shrink-0 justify-center gap-2 px-4 text-[13px] font-semibold"
                            onClick={() => void sendToPicking(o.id)}
                          >
                            <ArrowDownToLine className="h-4 w-4 shrink-0" aria-hidden />
                            Enviar para separação
                          </GlowButton>
                        ) : null}
                        <GlowButton
                          variant="secondary"
                          type="button"
                          className="min-h-[44px] shrink-0 justify-center px-4 text-[13px] font-semibold"
                          onClick={() => void toggleOrderUrgent(o)}
                        >
                          {urgentFlag ? 'Prioridade normal' : 'Marcar urgente'}
                        </GlowButton>
                        {canMarkPartial ? (
                          <GlowButton
                            variant="secondary"
                            type="button"
                            className="min-h-[44px] shrink-0 justify-center px-4 text-[13px] font-semibold"
                            onClick={() => void patchOrderStatus(o.id, 'PARCIAL')}
                          >
                            Marcar parcial
                          </GlowButton>
                        ) : null}
                        {canMarkPendency ? (
                          <GlowButton
                            variant="secondary"
                            type="button"
                            className="min-h-[44px] shrink-0 justify-center px-4 text-[13px] font-semibold"
                            onClick={() =>
                              void patchOrderStatus(o.id, 'AGUARDANDO_NF')
                            }
                          >
                            Marcar pendência
                          </GlowButton>
                        ) : null}
                        {canAttachNf ? (
                          <GlowButton
                            variant="secondary"
                            type="button"
                            className="min-h-[44px] shrink-0 justify-center gap-2 px-4 text-[13px] font-semibold"
                            onClick={() => void attachInvoiceOrder(o.id)}
                          >
                            <Receipt className="h-4 w-4 shrink-0" aria-hidden />
                            Atrelar NF
                          </GlowButton>
                        ) : null}
                        {canFinalizeSep ? (
                          <GlowButton
                            variant="primary"
                            type="button"
                            className="min-h-[44px] shrink-0 justify-center gap-2 px-4 text-[13px] font-semibold"
                            onClick={() => void markPicked(o.id)}
                          >
                            <Check className="h-4 w-4 shrink-0" aria-hidden />
                            Finalizar separação
                          </GlowButton>
                        ) : null}
                        {canAnalyze ? (
                          <GlowButton
                            variant="secondary"
                            type="button"
                            disabled={reservingOrderId === o.id}
                            className="min-h-[44px] shrink-0 justify-center gap-2 px-4 text-[13px] font-semibold"
                            onClick={() => void reserveOrder(o.id)}
                          >
                            {reservingOrderId === o.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            ) : (
                              <Zap className="h-4 w-4" aria-hidden />
                            )}
                            Analisar / reservar
                          </GlowButton>
                        ) : null}
                        <GlowButton
                          variant="secondary"
                          type="button"
                          className="min-h-[44px] shrink-0 justify-center px-4 text-[13px] font-semibold"
                          onClick={() => toggleExpand(o.id)}
                        >
                          <ChevronDown className="mr-1.5 h-4 w-4" aria-hidden />
                          Ocultar
                        </GlowButton>
                        {!isTerminal ? (
                          <button
                            type="button"
                            className="erp-chip-btn erp-chip-btn--danger inline-flex min-h-[44px] shrink-0 items-center gap-2 px-4 text-[13px]"
                            onClick={() => confirmCancelOrder(o)}
                          >
                            <X className="h-4 w-4" aria-hidden />
                            Cancelar pedido
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-6 grid gap-5 lg:grid-cols-2">
                      <ExpeditionDetailSection title="Detalhes do cliente">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <ExpeditionDetailTile
                            label="Razão social"
                            value={displayOrDash(o.customerName)}
                          />
                          <ExpeditionDetailTile
                            label="CNPJ"
                            value={displayOrDash(
                              o.customerDocument ?? o.deliveryCnpj,
                            )}
                            mono
                          />
                          <ExpeditionDetailTile
                            label="Endereço completo"
                            value={displayOrDash(o.deliveryAddress)}
                            className="sm:col-span-2"
                          />
                          <ExpeditionDetailTile
                            label="Cidade"
                            value={displayOrDash(deliveryCity)}
                          />
                          <ExpeditionDetailTile
                            label="Estado"
                            value={displayOrDash(deliveryState)}
                          />
                          <ExpeditionDetailTile label="CEP" value="—" />
                          <ExpeditionDetailTile label="Telefone" value="—" />
                          <ExpeditionDetailTile
                            label="Contato"
                            value={displayOrDash(o.receiverName)}
                          />
                          <ExpeditionDetailTile label="E-mail" value="—" />
                        </div>
                      </ExpeditionDetailSection>

                      <ExpeditionDetailSection title="Observações do pedido">
                        {hasObservations ? (
                          <div className="space-y-3">
                            {observationBlocks.map((block) =>
                              block.body ? (
                                <div
                                  key={block.key}
                                  className="erp-note-block"
                                >
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-erp-fg-muted">
                                    {block.title}
                                  </p>
                                  <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-erp-fg-secondary">
                                    {block.body}
                                  </p>
                                </div>
                              ) : null,
                            )}
                          </div>
                        ) : (
                          <p className="text-[13px] leading-relaxed text-erp-fg-muted">
                            Sem observações operacionais.
                          </p>
                        )}
                      </ExpeditionDetailSection>
                    </div>

                    <dl className="erp-order-meta-bar mt-5 grid gap-3 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <dt className="text-[10px] uppercase text-erp-fg-muted">Origem</dt>
                        <dd className="mt-1 text-erp-fg-secondary">{SOURCE_LABEL[o.source]}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase text-erp-fg-muted">Data pedido</dt>
                        <dd className="mt-1 font-mono text-erp-fg-secondary">
                          {formatDayDisplay(o.orderDate)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase text-erp-fg-muted">Data entrega</dt>
                        <dd className="mt-1 font-mono text-erp-fg-secondary">
                          {formatDayDisplay(o.requestedDeliveryDate)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase text-erp-fg-muted">Ponto de descarga</dt>
                        <dd className="mt-1 text-erp-fg-secondary">
                          {displayOrDash(o.unloadingPoint)}
                        </dd>
                      </div>
                      {o.invoiceNumber ? (
                        <div>
                          <dt className="text-[10px] uppercase text-erp-fg-muted">NF vinculada</dt>
                          <dd className="mt-1 font-mono text-[var(--erp-success)]">
                            {o.invoiceNumber}
                          </dd>
                        </div>
                      ) : null}
                    </dl>

                    <p className="mb-4 mt-8 text-[11px] font-bold uppercase tracking-[0.26em] text-erp-fg-muted">
                      Linhas do pedido
                    </p>
                    <div className="space-y-4">
                      {o.items.map((it) => {
                        const missing = it.missingQty ?? 0;
                        const lineHeader = `Linha ${it.lineNumber} | SKU ${it.sku} | ${it.description} | Qtd ${it.quantity}`;
                        const editableSep = o.status === 'EM_SEPARACAO';
                        const showSeparationTools = editableSep;

                        return (
                          <div
                            key={it.id}
                            className="erp-order-line-card"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-erp-border pb-3">
                              <p className="min-w-0 flex-1 text-[14px] font-medium leading-snug text-erp-fg">
                                {lineHeader}
                              </p>
                              <span className="erp-chip-btn shrink-0 px-2 py-1 text-[11px]">
                                {itemStockLabelShared(it.stockStatus)}
                              </span>
                            </div>
                            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
                              <div className="lg:col-span-2">
                                <p className="text-[10px] uppercase text-erp-fg-muted">Solicitado</p>
                                <p className="mt-1 font-mono text-lg text-erp-fg">
                                  {it.quantity.toLocaleString('pt-BR')}
                                </p>
                              </div>
                              <div className="lg:col-span-2">
                                <p className="text-[10px] uppercase text-erp-fg-muted">Reservado</p>
                                <p className="mt-1 font-mono text-lg text-[var(--erp-accent)]">
                                  {it.reservedQuantity.toLocaleString('pt-BR')}
                                </p>
                              </div>
                              <div className="lg:col-span-2">
                                <p className="text-[10px] uppercase text-erp-fg-muted">Faltante</p>
                                <p className="mt-1 font-mono text-lg text-[var(--erp-warning)]">
                                  {missing.toLocaleString('pt-BR')}
                                </p>
                              </div>
                              <div className="flex flex-col gap-2 lg:col-span-4">
                                <p className="text-[10px] uppercase text-erp-fg-muted">Separado</p>
                                {showSeparationTools ? (
                                  <ExpeditionPickedQtyControl
                                    key={`${o.id}-${it.id}-${it.pickedQty ?? 0}`}
                                    orderId={o.id}
                                    item={it}
                                    disabled={!editableSep}
                                    onSaved={() => void refreshAll()}
                                    onError={(m) => onToast({ variant: 'err', message: m })}
                                  />
                                ) : (
                                  <p className="font-mono text-lg text-[var(--erp-success)]">
                                    {(it.pickedQty ?? 0).toLocaleString('pt-BR')} un.
                                  </p>
                                )}
                              </div>
                              <div className="flex items-end lg:col-span-2">
                                <GlowButton
                                  variant="secondary"
                                  type="button"
                                  className="h-11 w-full justify-center text-[13px] font-semibold"
                                  disabled={!editableSep}
                                  onClick={() =>
                                    void markLineSeparated(o.id, it.id, it.quantity)
                                  }
                                >
                                  <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
                                  Marcar item separado
                                </GlowButton>
                              </div>
                            </div>
                            {missing > 0 ? (
                              <p className="mt-3 text-[12px] text-[var(--erp-warning)]">
                                Ruptura declarada pela análise: {missing.toLocaleString('pt-BR')}{' '}
                                unidades.
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    {o.status === 'EM_SEPARACAO' ? (
                      <div className="mt-6 flex flex-wrap gap-2" onClick={stopCardAction}>
                        <GlowButton
                          variant="secondary"
                          type="button"
                          className="min-h-[44px] px-5 text-[13px]"
                          onClick={() => void markAllSeparatedFromReserved(o.id)}
                        >
                          <Check className="mr-2 h-4 w-4" aria-hidden />
                          Igualar separado ao reservado (todas as linhas)
                        </GlowButton>
                      </div>
                    ) : null}

                    {o.status === 'NF_ATRELADA' ? (
                      <div className="mt-6 flex flex-wrap gap-2" onClick={stopCardAction}>
                        <GlowButton
                          variant="primary"
                          type="button"
                          className="min-h-[44px] justify-center gap-2 px-5 text-[13px] font-semibold"
                          onClick={() => void finalizeExpeditionOrder(o.id)}
                        >
                          <Truck className="h-4 w-4 shrink-0" aria-hidden />
                          Finalizar expedição (baixa física)
                        </GlowButton>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {meta && meta.totalPages > 1 && !ordersLoading ? (
        <div className="flex justify-center gap-4 pt-2">
          <GlowButton
            variant="secondary"
            type="button"
            disabled={page <= 1}
            className="min-h-[46px] min-w-[120px]"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </GlowButton>
          <GlowButton
            variant="secondary"
            type="button"
            disabled={page >= meta.totalPages}
            className="min-h-[46px] min-w-[120px]"
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </GlowButton>
        </div>
      ) : null}
    </section>
  );
}
