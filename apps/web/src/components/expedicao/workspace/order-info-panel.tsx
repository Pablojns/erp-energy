'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CalendarDays, Loader2, Pencil, Tag, Trash2, X } from 'lucide-react';
import { formatDeliveryAddressDisplay } from '@/src/components/cadastros/delivery-address';
import { formatDayDisplay } from '@/src/components/expedicao/expedition-wms-layout';
import {
  displayOrDash,
  formatOrderItemSaleValue,
  formatOverdueLabel,
  getOverdueDays,
  orderDisplayNumber,
} from '@/src/components/expedicao/shared/order-helpers';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import { OrderClickableStatusBadge } from '@/src/components/expedicao/workspace/order-clickable-status-badge';
import {
  ExistingEtiquetaChoiceModal,
  type ExistingEtiquetaChoice,
} from '@/src/components/expedicao/workspace/existing-etiqueta-choice-modal';
import {
  UrgentLinkSuggestionModal,
  type VinculoSugestao,
  type VinculoSugestoesResponse,
} from '@/src/components/expedicao/workspace/urgent-link-suggestion-modal';
import { PremiumSelect } from '@/src/components/ui/premium-select';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import {
  hasFiscalDocForEtiqueta,
  normalizeInvoiceNumberDigits,
  numeroPedFromOrder,
  pedidoApiUrl,
} from '@/src/services/api/pedidos-normalize';
import { isCorreiosCarrier } from '@/src/components/expedicao/shared/correios-carrier';

type CarrierOption = {
  id: string;
  name: string;
  isActive: boolean;
};

/** Etiqueta dos Correios (pré-postagem) ou etiqueta interna do ERP. */
type EtiquetaKind = 'correios' | 'erp';

type NfHistoricoItem = {
  id: string;
  invoiceNumber: string;
  invoiceValue?: string | null;
  pickedQtyAtTime: number;
  createdAt: string;
  createdBy: string | null;
  orderId?: string;
  orderNumber?: string;
  orderCode?: string;
  deliveryCnpj?: string | null;
  customerName?: string | null;
};

function formatMoneyBrl(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatNfHistoricoDetail(row: NfHistoricoItem): string {
  const when = new Date(row.createdAt).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const valor = formatMoneyBrl(row.invoiceValue);
  const pedido = row.orderNumber ? ` · Pedido ${row.orderNumber}` : '';
  return `NF ${row.invoiceNumber} — ${valor} — ${when} — ${row.pickedQtyAtTime} un.${pedido}`;
}

function parseVolumesInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export type OrderInfoPanelHandle = {
  isVolumesValid: () => boolean;
  ensureVolumesSaved: () => Promise<boolean>;
};

function HeaderField(props: { label: string; children: ReactNode }) {
  const { label, children } = props;
  return (
    <div className="exp-wb-order-header-field gap-0.5">
      <span className="exp-wb-order-header-label">{label}</span>
      <div className="exp-wb-order-header-value">{children}</div>
    </div>
  );
}

function PartyCell(props: {
  label: string;
  value: string;
  copyValue?: string;
  multiline?: boolean;
}) {
  const { label, value, copyValue, multiline = false } = props;
  return (
    <div
      className={`exp-wb-order-party-cell${multiline ? ' exp-wb-order-party-cell--wrap' : ''}`}
    >
      <span className="exp-wb-order-party-label">{label}</span>
      <div className="exp-wb-order-party-value-row min-w-0">
        <span
          className={`exp-wb-order-party-value${
            multiline
              ? ' exp-wb-order-party-value--wrap'
              : copyValue
                ? ' exp-wb-order-party-value--ellipsis'
                : ''
          }`}
          title={multiline ? undefined : value}
        >
          {value}
        </span>
        {copyValue && !multiline ? (
          <button
            type="button"
            className="exp-wb-order-party-copy"
            aria-label="Copiar endereço"
            title="Copiar endereço"
            onClick={() => void navigator.clipboard.writeText(copyValue)}
          >
            📋
          </button>
        ) : null}
      </div>
    </div>
  );
}

export const OrderInfoPanel = forwardRef<
  OrderInfoPanelHandle,
  {
    order: OrderDto;
    onCarrierChange?: (carrierId: string | null) => void | Promise<void>;
    carrierSaving?: boolean;
    onNotaRemessaSaved?: (value: string | null) => void;
    onVolumesSaved?: () => void;
    onVolumesValidityChange?: (valid: boolean) => void;
    hideVolumes?: boolean;
    onStatusChanged?: () => void;
    onToggleUrgent?: () => void | Promise<void>;
    showFinalizeVolumesHint?: boolean;
    panelMode?: 'orders' | 'separation';
    isAdmin?: boolean;
    onEditOrder?: () => void;
    compactHeaderActions?: boolean;
    /** Slot mobile (ex.: menu ⋮) alinhado à direita da linha do número/status. */
    headerTrailing?: ReactNode;
  }
>(function OrderInfoPanel(props, ref) {
  const {
    order,
    onCarrierChange,
    carrierSaving = false,
    onNotaRemessaSaved,
    onVolumesSaved,
    onVolumesValidityChange,
    hideVolumes = false,
    onStatusChanged,
    onToggleUrgent,
    showFinalizeVolumesHint = false,
    panelMode = 'separation',
    isAdmin = false,
    onEditOrder,
    compactHeaderActions = false,
    headerTrailing,
  } = props;

  const isOrdersMode = panelMode === 'orders';
  const isSiteOrder = order.source === 'SITE';
  const isVendaExternaOrder = order.source === 'VENDA_EXTERNA';
  const isSimpleCustomerLayout = isSiteOrder || isVendaExternaOrder;

  const numero = orderDisplayNumber(order);
  const overdue = getOverdueDays(order);
  const urgent = order.priority <= 2;
  const cnpj = displayOrDash(order.deliveryCnpj ?? order.customerDocument);
  const address = formatDeliveryAddressDisplay(order.deliveryAddress);
  const receiver = displayOrDash(order.receiverName);

  const [vinculoSuggestions, setVinculoSuggestions] = useState<VinculoSugestao[]>(
    [],
  );
  const [vinculoBaseTotal, setVinculoBaseTotal] = useState(order.totalValue);
  const [vinculoLoading, setVinculoLoading] = useState(false);
  const [vinculoError, setVinculoError] = useState<string | null>(null);
  const [reviewSuggestion, setReviewSuggestion] =
    useState<VinculoSugestao | null>(null);
  const [discardedSuggestionIds, setDiscardedSuggestionIds] = useState<
    Set<string>
  >(() => new Set());

  const canFetchVinculoSuggestions =
    Boolean(order.isUrgentManual && order.source === 'MANUAL') ||
    ((order.source === 'WEG_MERCADO_ELETRONICO' ||
      order.source === 'VENDA_EXTERNA') &&
      !order.linkedOrderId);

  const loadVinculoSuggestions = useCallback(async () => {
    if (!canFetchVinculoSuggestions) {
      setVinculoSuggestions([]);
      return;
    }
    const key = numeroPedFromOrder(order) || order.code;
    if (!key) return;
    setVinculoLoading(true);
    setVinculoError(null);
    try {
      const res = await erpFetchJson<VinculoSugestoesResponse>(
        pedidoApiUrl(key, 'sugestoes-vinculo'),
      );
      setVinculoBaseTotal(res.base?.totalValue ?? order.totalValue);
      setVinculoSuggestions(
        Array.isArray(res.suggestions) ? res.suggestions : [],
      );
    } catch (err) {
      setVinculoSuggestions([]);
      setVinculoError(
        err instanceof Error ? err.message : 'Falha ao buscar sugestões.',
      );
    } finally {
      setVinculoLoading(false);
    }
  }, [canFetchVinculoSuggestions, order, order.totalValue]);

  useEffect(() => {
    setDiscardedSuggestionIds(new Set());
    void loadVinculoSuggestions();
  }, [order.id, loadVinculoSuggestions]);

  const visibleVinculoSuggestions = useMemo(
    () =>
      vinculoSuggestions.filter((s) => !discardedSuggestionIds.has(s.orderId)),
    [vinculoSuggestions, discardedSuggestionIds],
  );
  const topVinculoSuggestion = visibleVinculoSuggestions[0] ?? null;

  const separationTotals = useMemo(() => {
    let ordered = 0;
    let picked = 0;
    let shipped = 0;
    for (const it of order.items ?? []) {
      ordered += it.quantity ?? 0;
      picked += it.pickedQty ?? 0;
      shipped += it.invoicedQty ?? 0;
    }
    return {
      ordered,
      picked,
      shipped,
      missing: Math.max(0, ordered - picked),
    };
  }, [order.items]);
  const saidas = order.saidas ?? [];
  const point = displayOrDash(order.unloadingPoint);
  const simpleCliente = displayOrDash(order.customerName);
  const simpleEndereco = formatDeliveryAddressDisplay(
    order.deliveryAddress ?? order.unloadingPoint,
  );
  const pointAsAddress = formatDeliveryAddressDisplay(order.unloadingPoint);
  // Pedidos (Site/Venda Externa): oculta Recebedor/Ponto quando idênticos a Cliente/Endereço.
  const hideDuplicateReceiverPoint =
    isOrdersMode &&
    isSimpleCustomerLayout &&
    receiver === simpleCliente &&
    (point === simpleEndereco || pointAsAddress === simpleEndereco);
  const notes = order.notes?.trim() || null;
  const notaVenda = order.invoiceNumber?.trim() || null;
  const isFinalized =
    order.status === 'FINALIZADO' || order.status === 'EXPEDIDO';
  // Só pedidos finalizados bloqueiam edição; NF residual/histórica não trava o campo.
  const canEditInvoiceField = !isFinalized;
  const fieldsReadOnly = isFinalized;

  const [carriers, setCarriers] = useState<CarrierOption[]>([]);
  const [carriersLoading, setCarriersLoading] = useState(false);
  const [notaRemessa, setNotaRemessa] = useState(order.notaRemessa ?? '');
  const [notaVendaInput, setNotaVendaInput] = useState(order.invoiceNumber ?? '');
  const [notaRemessaConfirmada, setNotaRemessaConfirmada] = useState(
    order.notaRemessaConfirmada ?? false,
  );
  const [savingNotaRemessa, setSavingNotaRemessa] = useState(false);
  const [savingNotaVenda, setSavingNotaVenda] = useState(false);
  const [notaRemessaError, setNotaRemessaError] = useState<string | null>(null);
  const [notaVendaError, setNotaVendaError] = useState<string | null>(null);
  const lastSavedNotaRemessaRef = useRef(order.notaRemessa ?? '');
  const lastSavedNotaRemessaConfirmadaRef = useRef(order.notaRemessaConfirmada ?? false);
  const lastSavedNotaVendaRef = useRef(order.invoiceNumber ?? '');

  const [volumesInput, setVolumesInput] = useState(
    order.volumes != null ? String(order.volumes) : '',
  );
  const [savingVolumes, setSavingVolumes] = useState(false);
  const [volumesError, setVolumesError] = useState<string | null>(null);
  const lastSavedVolumesRef = useRef<number | null>(order.volumes ?? null);
  const [emittingEtiqueta, setEmittingEtiqueta] = useState<EtiquetaKind | null>(
    null,
  );
  const [cancellingEtiqueta, setCancellingEtiqueta] = useState(false);
  const [etiquetaError, setEtiquetaError] = useState<string | null>(null);
  const [existingEtiquetaModalOpen, setExistingEtiquetaModalOpen] = useState(false);
  const [existingEtiquetaCode, setExistingEtiquetaCode] = useState('');
  const [exitingWithExistingEtiqueta, setExitingWithExistingEtiqueta] = useState(false);
  const [trackingCodeInput, setTrackingCodeInput] = useState(order.trackingCode ?? '');
  const [savingTrackingCode, setSavingTrackingCode] = useState(false);
  const [trackingCodeError, setTrackingCodeError] = useState<string | null>(null);
  const lastSavedTrackingCodeRef = useRef(order.trackingCode ?? '');
  const [nfHistorico, setNfHistorico] = useState<NfHistoricoItem[]>([]);
  const [nfHistoricoLoading, setNfHistoricoLoading] = useState(false);
  const [nfHistoricoModalOpen, setNfHistoricoModalOpen] = useState(false);
  const [nfHistoricoSearch, setNfHistoricoSearch] = useState('');
  const [nfHistoricoSearchLoading, setNfHistoricoSearchLoading] = useState(false);
  const [nfHistoricoSearchResults, setNfHistoricoSearchResults] = useState<
    NfHistoricoItem[] | null
  >(null);
  const [editingNfHistory, setEditingNfHistory] = useState<NfHistoricoItem | null>(
    null,
  );
  const [addingNf, setAddingNf] = useState(false);
  const [editNfNumber, setEditNfNumber] = useState('');
  const [editNfValue, setEditNfValue] = useState('');
  const [editNfPickedQty, setEditNfPickedQty] = useState('');
  const [editNfDate, setEditNfDate] = useState('');
  const [savingNfHistory, setSavingNfHistory] = useState(false);
  const [deletingNfHistoryId, setDeletingNfHistoryId] = useState<string | null>(null);
  const [clearingNfHistorico, setClearingNfHistorico] = useState(false);

  const isCorreiosOrder = isCorreiosCarrier(order.carrierName);
  // Correios → etiqueta via API dos Correios; demais transportadoras → etiqueta
  // interna do ERP. NF de venda ou Nota de Remessa confirmada liberam as duas.
  const canEmitEtiqueta =
    order.status === 'FINALIZADO' ||
    (hasFiscalDocForEtiqueta(order) &&
      (order.status === 'NF_ATRELADA' ||
        order.status === 'AGUARDANDO_NF' ||
        order.status === 'SEPARADO'));
  // Correios: as duas etiquetas ficam disponíveis (pré-postagem + etiqueta interna).
  const showBothEtiquetas = isCorreiosOrder && canEmitEtiqueta;
  const canCancelCorreiosEtiqueta =
    isCorreiosOrder && Boolean(order.trackingCode?.trim());
  /** Edição manual liberada para WEG e Site (corrige etiqueta emitida em duplicidade). */
  const canEditTrackingCode = true;

  useEffect(() => {
    const initial = order.notaRemessa ?? '';
    const confirmed = order.notaRemessaConfirmada ?? false;
    const invoice = order.invoiceNumber ?? '';
    setNotaRemessa(initial);
    setNotaVendaInput(invoice);
    setNotaRemessaConfirmada(confirmed);
    lastSavedNotaRemessaRef.current = initial;
    lastSavedNotaRemessaConfirmadaRef.current = confirmed;
    lastSavedNotaVendaRef.current = invoice;
    setNotaRemessaError(null);
    setNotaVendaError(null);
  }, [order.id, order.notaRemessa, order.notaRemessaConfirmada, order.invoiceNumber]);

  useEffect(() => {
    const initial = order.volumes ?? null;
    setVolumesInput(initial != null ? String(initial) : '');
    lastSavedVolumesRef.current = initial;
    setVolumesError(null);
  }, [order.id, order.volumes]);

  useEffect(() => {
    const initial = order.trackingCode ?? '';
    setTrackingCodeInput(initial);
    lastSavedTrackingCodeRef.current = initial;
    setTrackingCodeError(null);
  }, [order.id, order.trackingCode]);

  useEffect(() => {
    setNfHistoricoModalOpen(false);
    setNfHistoricoSearch('');
    setNfHistoricoSearchResults(null);
    setEditingNfHistory(null);
    setAddingNf(false);
  }, [order.id]);

  useEffect(() => {
    const numeroPed = numeroPedFromOrder(order);
    if (!numeroPed) {
      setNfHistorico([]);
      return;
    }
    let cancelled = false;
    setNfHistoricoLoading(true);
    void erpFetchJson<{ historico: NfHistoricoItem[] }>(
      pedidoApiUrl(numeroPed, 'nf-historico'),
    )
      .then((res) => {
        if (!cancelled) {
          const rows = Array.isArray(res.historico) ? res.historico : [];
          setNfHistorico(
            rows.filter(
              (row) =>
                normalizeInvoiceNumberDigits(row.invoiceNumber).length > 0,
            ),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setNfHistorico([]);
      })
      .finally(() => {
        if (!cancelled) setNfHistoricoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [order.id, order.invoiceNumber, order.code, order.externalOrderNumber]);

  const runNfHistoricoSearch = async () => {
    const q = nfHistoricoSearch.trim();
    if (!q) {
      setNfHistoricoSearchResults(null);
      return;
    }
    setNfHistoricoSearchLoading(true);
    try {
      const res = await erpFetchJson<{ historico: NfHistoricoItem[] }>(
        `api/pedidos/nf-historico/search?q=${encodeURIComponent(q)}`,
      );
      setNfHistoricoSearchResults(Array.isArray(res.historico) ? res.historico : []);
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : 'Falha ao buscar no histórico de NFs.',
      );
      setNfHistoricoSearchResults([]);
    } finally {
      setNfHistoricoSearchLoading(false);
    }
  };

  const openEditNfHistory = (row: NfHistoricoItem) => {
    setAddingNf(false);
    setEditingNfHistory(row);
    setEditNfNumber(row.invoiceNumber);
    setEditNfValue(row.invoiceValue ?? '');
    setEditNfPickedQty(String(row.pickedQtyAtTime ?? 0));
    setEditNfDate(row.createdAt.slice(0, 10));
  };

  const openAddNfHistory = () => {
    setEditingNfHistory(null);
    setAddingNf(true);
    setEditNfNumber('');
    setEditNfValue('');
    setEditNfPickedQty('0');
    setEditNfDate(new Date().toISOString().slice(0, 10));
    setNfHistoricoSearchResults(null);
  };

  const closeNfForm = () => {
    setEditingNfHistory(null);
    setAddingNf(false);
  };

  const saveEditNfHistory = async () => {
    const invoiceNumber = editNfNumber.trim();
    if (!invoiceNumber) {
      window.alert('Informe o número da NF.');
      return;
    }
    const picked = Number.parseInt(editNfPickedQty.trim(), 10);
    if (!Number.isInteger(picked) || picked < 0) {
      window.alert('Quantidade separada inválida.');
      return;
    }
    if (!editNfDate.trim()) {
      window.alert('Informe a data da NF.');
      return;
    }

    const numeroPed = numeroPedFromOrder(order);
    if (!numeroPed && addingNf) {
      window.alert('Pedido sem número para vincular a NF.');
      return;
    }

    setSavingNfHistory(true);
    try {
      if (addingNf) {
        const res = await erpFetchJson<{
          currentInvoiceNumber: string | null;
          historico: NfHistoricoItem[];
        }>(pedidoApiUrl(numeroPed!, 'nf-historico'), {
          method: 'POST',
          body: JSON.stringify({
            invoiceNumber,
            invoiceValue: editNfValue.trim() || null,
            pickedQtyAtTime: picked,
            createdAt: editNfDate.trim(),
          }),
        });
        setNfHistorico(Array.isArray(res.historico) ? res.historico : []);
        const nextInvoice = res.currentInvoiceNumber ?? invoiceNumber;
        setNotaVendaInput(nextInvoice);
        lastSavedNotaVendaRef.current = nextInvoice;
        onNotaRemessaSaved?.(nextInvoice);
        closeNfForm();
        return;
      }

      if (!editingNfHistory) return;
      const updated = await erpFetchJson<NfHistoricoItem>(
        `api/pedidos/nf-historico/${editingNfHistory.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            invoiceNumber,
            invoiceValue: editNfValue.trim() || null,
            pickedQtyAtTime: picked,
            createdAt: editNfDate.trim(),
          }),
        },
      );
      const mergeRow = (row: NfHistoricoItem): NfHistoricoItem =>
        row.id === updated.id
          ? {
              ...row,
              invoiceNumber: updated.invoiceNumber,
              invoiceValue: updated.invoiceValue ?? null,
              pickedQtyAtTime: updated.pickedQtyAtTime,
              createdAt: updated.createdAt,
            }
          : row;
      setNfHistorico((prev) => prev.map(mergeRow));
      setNfHistoricoSearchResults((prev) =>
        prev ? prev.map(mergeRow) : prev,
      );
      if (
        order.invoiceNumber?.trim() === editingNfHistory.invoiceNumber.trim()
      ) {
        setNotaVendaInput(invoiceNumber);
        lastSavedNotaVendaRef.current = invoiceNumber;
        onNotaRemessaSaved?.(invoiceNumber);
      }
      closeNfForm();
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : 'Não foi possível salvar a NF.',
      );
    } finally {
      setSavingNfHistory(false);
    }
  };

  const deleteNfHistoricoItem = async (row: NfHistoricoItem) => {
    const numeroPed = numeroPedFromOrder(order);
    if (!numeroPed) return;
    if (
      !window.confirm(
        `Remover NF ${row.invoiceNumber} do histórico deste pedido?`,
      )
    ) {
      return;
    }
    setDeletingNfHistoryId(row.id);
    try {
      const res = await erpFetchJson<{
        currentInvoiceNumber: string | null;
        historico: NfHistoricoItem[];
      }>(pedidoApiUrl(numeroPed, 'nf-historico', row.id), {
        method: 'DELETE',
      });
      setNfHistorico(Array.isArray(res.historico) ? res.historico : []);
      const nextInvoice = res.currentInvoiceNumber ?? '';
      setNotaVendaInput(nextInvoice);
      lastSavedNotaVendaRef.current = nextInvoice;
      onNotaRemessaSaved?.(res.currentInvoiceNumber);
      if (res.historico.length === 0) setNfHistoricoModalOpen(false);
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : 'Não foi possível remover a NF do histórico.',
      );
    } finally {
      setDeletingNfHistoryId(null);
    }
  };

  const clearNfHistorico = async () => {
    const numeroPed = numeroPedFromOrder(order);
    if (!numeroPed) return;
    if (
      !window.confirm(
        'Limpar todo o histórico de notas fiscais deste pedido? A Nota de Venda atual também será limpa se estiver no histórico.',
      )
    ) {
      return;
    }
    setClearingNfHistorico(true);
    try {
      const res = await erpFetchJson<{
        currentInvoiceNumber: string | null;
        historico: NfHistoricoItem[];
      }>(pedidoApiUrl(numeroPed, 'nf-historico'), {
        method: 'DELETE',
      });
      setNfHistorico(Array.isArray(res.historico) ? res.historico : []);
      const nextInvoice = res.currentInvoiceNumber ?? '';
      setNotaVendaInput(nextInvoice);
      lastSavedNotaVendaRef.current = nextInvoice;
      onNotaRemessaSaved?.(res.currentInvoiceNumber);
      setNfHistoricoModalOpen(false);
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : 'Não foi possível limpar o histórico.',
      );
    } finally {
      setClearingNfHistorico(false);
    }
  };

  useEffect(() => {
    if (isOrdersMode) return;
    onVolumesValidityChange?.(parseVolumesInput(volumesInput) !== null);
  }, [volumesInput, onVolumesValidityChange, isOrdersMode]);

  useEffect(() => {
    let cancelled = false;
    setCarriersLoading(true);
    void erpFetchJson<CarrierOption[]>('cadastros/carriers')
      .then((rows) => {
        if (!cancelled) {
          setCarriers(rows.filter((c) => c.isActive));
        }
      })
      .catch(() => {
        if (!cancelled) setCarriers([]);
      })
      .finally(() => {
        if (!cancelled) setCarriersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const carrierOptions = [
    { value: '', label: '— Selecionar —' },
    ...carriers.map((c) => ({ value: c.id, label: c.name })),
  ];

  const saveNotaRemessa = async (opts?: { confirmed?: boolean }) => {
    const trimmed = notaRemessa.trim();
    const confirmed = opts?.confirmed ?? notaRemessaConfirmada;
    const persisted = trimmed || null;
    const lastPersisted = lastSavedNotaRemessaRef.current.trim() || null;
    const lastConfirmed = lastSavedNotaRemessaConfirmadaRef.current;

    if (confirmed && !trimmed) {
      setNotaRemessaError('Informe o número da nota de remessa para confirmar.');
      return;
    }

    if (persisted === lastPersisted && confirmed === lastConfirmed && !savingNotaRemessa) {
      return;
    }

    const numeroPed = numeroPedFromOrder(order);
    if (!numeroPed) {
      setNotaRemessaError('Número do pedido inválido.');
      return;
    }

    setSavingNotaRemessa(true);
    setNotaRemessaError(null);
    const previous = lastSavedNotaRemessaRef.current;
    const previousConfirmed = lastSavedNotaRemessaConfirmadaRef.current;

    try {
      await erpFetchJson(pedidoApiUrl(numeroPed, 'status'), {
        method: 'PATCH',
        body: JSON.stringify({
          notaRemessa: trimmed,
          notaRemessaConfirmada: confirmed,
        }),
      });
      lastSavedNotaRemessaRef.current = trimmed;
      lastSavedNotaRemessaConfirmadaRef.current = confirmed;
      onNotaRemessaSaved?.(persisted);
    } catch {
      setNotaRemessa(previous);
      setNotaRemessaConfirmada(previousConfirmed);
      setNotaRemessaError('Não foi possível salvar.');
    } finally {
      setSavingNotaRemessa(false);
    }
  };

  const saveNotaVenda = async () => {
    const trimmed = notaVendaInput.trim();
    const persisted = trimmed || null;
    const lastPersisted = lastSavedNotaVendaRef.current.trim() || null;

    if (persisted === lastPersisted && !savingNotaVenda) {
      return;
    }

    const numeroPed = numeroPedFromOrder(order);
    if (!numeroPed) {
      setNotaVendaError('Número do pedido inválido.');
      return;
    }

    setSavingNotaVenda(true);
    setNotaVendaError(null);
    const previous = lastSavedNotaVendaRef.current;

    try {
      await erpFetchJson(pedidoApiUrl(numeroPed, 'status'), {
        method: 'PATCH',
        body: JSON.stringify({ invoiceNumber: trimmed }),
      });
      lastSavedNotaVendaRef.current = trimmed;
      onNotaRemessaSaved?.(persisted);
      onStatusChanged?.();
    } catch {
      setNotaVendaInput(previous);
      setNotaVendaError('Não foi possível salvar.');
    } finally {
      setSavingNotaVenda(false);
    }
  };

  const saveVolumes = async (value: number): Promise<boolean> => {
    if (lastSavedVolumesRef.current === value || savingVolumes) return true;

    const numeroPed = numeroPedFromOrder(order);
    if (!numeroPed) {
      setVolumesError('Número do pedido inválido.');
      return false;
    }

    setSavingVolumes(true);
    setVolumesError(null);

    try {
      await erpFetchJson(pedidoApiUrl(numeroPed, 'volumes'), {
        method: 'PATCH',
        body: JSON.stringify({ volumes: value }),
      });
      lastSavedVolumesRef.current = value;
      onVolumesSaved?.();
      return true;
    } catch {
      setVolumesError('Não foi possível salvar os volumes.');
      return false;
    } finally {
      setSavingVolumes(false);
    }
  };

  const saveTrackingCode = async () => {
    const trimmed = trackingCodeInput.trim();
    const lastPersisted = lastSavedTrackingCodeRef.current.trim();

    if (trimmed === lastPersisted && !savingTrackingCode) {
      return;
    }

    const numeroPed = numeroPedFromOrder(order);
    if (!numeroPed) {
      setTrackingCodeError('Número do pedido inválido.');
      return;
    }

    setSavingTrackingCode(true);
    setTrackingCodeError(null);
    const previous = lastSavedTrackingCodeRef.current;

    try {
      await erpFetchJson(pedidoApiUrl(numeroPed, 'rastreio'), {
        method: 'PATCH',
        body: JSON.stringify({ trackingCode: trimmed }),
      });
      lastSavedTrackingCodeRef.current = trimmed;
      setTrackingCodeInput(trimmed);
      onStatusChanged?.();
    } catch {
      setTrackingCodeInput(previous);
      setTrackingCodeError('Não foi possível salvar o código de rastreio.');
    } finally {
      setSavingTrackingCode(false);
    }
  };

  const emitEtiquetaPdf = async (
    kind: EtiquetaKind = isCorreiosOrder ? 'correios' : 'erp',
  ) => {
    const numeroPed = numeroPedFromOrder(order);
    if (!numeroPed) {
      setEtiquetaError('Número do pedido inválido.');
      return;
    }

    setEmittingEtiqueta(kind);
    setEtiquetaError(null);

    try {
      const etiquetaEndpoint =
        kind === 'correios' ? 'etiqueta-correios' : 'etiqueta';
      // pedidoApiUrl inclui "api/" — erpFetchJson remove; aqui o fetch monta /api/erp/* manualmente.
      const etiquetaPath = pedidoApiUrl(numeroPed, etiquetaEndpoint).replace(
        /^api\//,
        '',
      );
      const res = await fetch(`/api/erp/${etiquetaPath}`, {
        credentials: 'include',
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        const text = await res.text();
        let message = 'Não foi possível gerar a etiqueta.';
        try {
          const body = JSON.parse(text) as { message?: string | string[] };
          if (body.message) {
            message = Array.isArray(body.message)
              ? body.message.join(' · ')
              : body.message;
          }
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);

      // Após etiqueta: registra saída quando o pedido ainda está no fluxo de separação
      // (Correios já tenta no backend; POST /saida é idempotente).
      const canRegisterExit =
        order.status === 'SEPARADO' ||
        order.status === 'AGUARDANDO_NF' ||
        order.status === 'NF_ATRELADA';
      if (canRegisterExit) {
        const invoiceDigits = normalizeInvoiceNumberDigits(order.invoiceNumber);
        const remessa = order.notaRemessa?.trim() || '';
        const body = invoiceDigits
          ? { invoiceNumber: invoiceDigits }
          : remessa
            ? {}
            : {
                invoiceNumber:
                  order.trackingCode?.trim() || existingEtiquetaCode || '',
              };
        if (invoiceDigits || remessa || body.invoiceNumber) {
          await erpFetchJson(pedidoApiUrl(numeroPed, 'saida'), {
            method: 'POST',
            body: JSON.stringify(body),
          });
        }
      }

      onStatusChanged?.();
    } catch (err) {
      const timedOut =
        err instanceof DOMException && err.name === 'TimeoutError';
      setEtiquetaError(
        timedOut
          ? 'A geração da etiqueta demorou demais. Tente novamente.'
          : err instanceof Error
            ? err.message
            : 'Não foi possível gerar a etiqueta.',
      );
    } finally {
      setEmittingEtiqueta(null);
    }
  };

  const exitWithExistingEtiqueta = async () => {
    const numeroPed = numeroPedFromOrder(order);
    if (!numeroPed) {
      setEtiquetaError('Número do pedido inválido.');
      return;
    }

    setExitingWithExistingEtiqueta(true);
    setEtiquetaError(null);
    try {
      const invoiceDigits = normalizeInvoiceNumberDigits(order.invoiceNumber);
      const remessa = order.notaRemessa?.trim() || '';
      const body = invoiceDigits
        ? { invoiceNumber: invoiceDigits }
        : remessa || order.notaRemessaConfirmada
          ? {}
          : { invoiceNumber: existingEtiquetaCode || order.trackingCode?.trim() || '' };

      if (!invoiceDigits && !remessa && !body.invoiceNumber) {
        throw new Error(
          'Informe a Nota de Venda/Remessa ou mantenha o código de rastreio para registrar a saída.',
        );
      }

      await erpFetchJson(pedidoApiUrl(numeroPed, 'saida'), {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onStatusChanged?.();
    } catch (err) {
      setEtiquetaError(
        err instanceof Error
          ? err.message
          : 'Não foi possível registrar a saída com a etiqueta existente.',
      );
    } finally {
      setExitingWithExistingEtiqueta(false);
    }
  };

  const handleEmitEtiqueta = async (kind?: EtiquetaKind) => {
    const target = kind ?? (isCorreiosOrder ? 'correios' : 'erp');
    // Aviso de duplicidade só existe para Correios (pré-postagem já criada).
    // Etiqueta interna do ERP é só reimpressão do PDF.
    const existingTracking =
      target === 'correios'
        ? trackingCodeInput.trim() || order.trackingCode?.trim() || ''
        : '';
    if (existingTracking) {
      setExistingEtiquetaCode(existingTracking);
      setExistingEtiquetaModalOpen(true);
      return;
    }
    await emitEtiquetaPdf(target);
  };

  const handleExistingEtiquetaChoice = (choice: ExistingEtiquetaChoice) => {
    setExistingEtiquetaModalOpen(false);
    if (choice === 'cancel') return;
    if (choice === 'exit-existing') {
      void exitWithExistingEtiqueta();
      return;
    }
    void emitEtiquetaPdf('correios');
  };

  const handleCancelCorreiosEtiqueta = async () => {
    const numeroPed = numeroPedFromOrder(order);
    if (!numeroPed) {
      setEtiquetaError('Número do pedido inválido.');
      return;
    }

    const tracking = order.trackingCode?.trim();
    if (!tracking) return;

    const confirmed = window.confirm(
      `Cancelar a etiqueta Correios ${tracking}?\n\nA pré-postagem será cancelada no site dos Correios e o código de rastreio será removido do pedido.`,
    );
    if (!confirmed) return;

    setCancellingEtiqueta(true);
    setEtiquetaError(null);

    try {
      await erpFetchJson(pedidoApiUrl(numeroPed, 'etiqueta-correios'), {
        method: 'DELETE',
      });
      setTrackingCodeInput('');
      lastSavedTrackingCodeRef.current = '';
      onStatusChanged?.();
    } catch (err) {
      setEtiquetaError(
        err instanceof Error
          ? err.message
          : 'Não foi possível cancelar a etiqueta Correios.',
      );
    } finally {
      setCancellingEtiqueta(false);
    }
  };

  useImperativeHandle(ref, () => ({
    isVolumesValid: () => parseVolumesInput(volumesInput) !== null,
    ensureVolumesSaved: async () => {
      const parsed = parseVolumesInput(volumesInput);
      if (parsed === null) return false;
      return saveVolumes(parsed);
    },
  }));

  const inputClassName =
    'exp-wb-transport-input w-full min-w-0 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-2 text-[12px] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)] disabled:cursor-default disabled:opacity-60 text-[var(--color-text-secondary,var(--text-secondary))]';

  return (
    <div className="exp-wb-section-card exp-wb-order-data-card exp-wb-order-data-card--blocks !gap-1.5 !p-3">
      {order.linkedOrderId && order.source === 'WEG_MERCADO_ELETRONICO' ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Este pedido já foi enviado via saída urgente. Apenas emita a NF.
          {order.linkedOrderDisplayNumber ? (
            <span className="mt-1 block text-amber-700">
              Referência urgente: #{order.linkedOrderDisplayNumber}
            </span>
          ) : null}
        </div>
      ) : null}
      {topVinculoSuggestion ? (
        <div className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                Possível correspondência encontrada: Pedido #
                {topVinculoSuggestion.displayNumber}
              </p>
              <p className="mt-0.5 text-sky-800">
                {topVinculoSuggestion.reasons.join(', ')}. Confirmar vínculo?
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-md bg-sky-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-800"
                  onClick={() => setReviewSuggestion(topVinculoSuggestion)}
                >
                  Revisar e confirmar
                </button>
                <button
                  type="button"
                  className="rounded-md border border-sky-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-800 hover:bg-sky-100"
                  onClick={() =>
                    setDiscardedSuggestionIds((prev) => {
                      const next = new Set(prev);
                      next.add(topVinculoSuggestion.orderId);
                      return next;
                    })
                  }
                >
                  Descartar
                </button>
                {visibleVinculoSuggestions.length > 1 ? (
                  <span className="self-center text-[10px] text-sky-700">
                    +{visibleVinculoSuggestions.length - 1} outra(s)
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : vinculoLoading && canFetchVinculoSuggestions ? (
        <p className="text-[11px] text-[var(--text-muted)]">
          Buscando possíveis vínculos…
        </p>
      ) : null}
      {vinculoError ? (
        <p className="text-[11px] text-rose-500">{vinculoError}</p>
      ) : null}
      <div className="exp-wb-order-header-meta">
        <div className="pedido-header-row1 exp-wb-order-header-meta--row">
          <p className="pedido-numero exp-wb-order-number m-0 shrink-0 text-[13px] font-semibold">
            #{numero}
          </p>
          <div className="pedido-status-badge shrink-0">
            <OrderClickableStatusBadge
              order={order}
              onStatusChanged={onStatusChanged}
              readOnly={fieldsReadOnly}
            />
          </div>
          {headerTrailing ? (
            <div className="pedido-menu-btn ml-auto shrink-0 md:hidden">{headerTrailing}</div>
          ) : null}
          <div className="pedido-entrega exp-wb-order-header-delivery exp-wb-order-header-delivery--inline ml-auto min-w-0">
            <CalendarDays
              className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-secondary,var(--text-secondary))]"
              aria-hidden
            />
            <span className="exp-wb-order-header-label">Entrega:</span>
            <span className="exp-wb-order-header-value">
              {order.requestedDeliveryDate
                ? formatDayDisplay(order.requestedDeliveryDate)
                : 'não informada'}
            </span>
            {overdue !== null ? (
              <span className="badge-atrasado exp-wb-late-badge shrink-0">
                {formatOverdueLabel(overdue)}
              </span>
            ) : null}
          </div>
          <div
            className={`exp-wb-order-header-actions${compactHeaderActions ? ' hidden md:flex' : ''}`}
          >
            {onToggleUrgent ? (
              urgent ? (
                <button
                  type="button"
                  className="exp-wb-order-badge exp-wb-order-badge--urgent exp-wb-order-badge--pulse"
                  onClick={() => void onToggleUrgent()}
                >
                  Urgente
                </button>
              ) : (
                <button
                  type="button"
                  className="exp-wb-urgency-toggle text-[12px]"
                  onClick={() => void onToggleUrgent()}
                >
                  Marcar urgente
                </button>
              )
            ) : urgent ? (
              <span className="exp-wb-order-badge exp-wb-order-badge--urgent exp-wb-order-badge--pulse">
                Urgente
              </span>
            ) : null}
            {isAdmin && onEditOrder ? (
              <button
                type="button"
                className="exp-wb-urgency-toggle inline-flex items-center gap-1 text-[12px]"
                onClick={onEditOrder}
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar Pedido
              </button>
            ) : null}
            {canEmitEtiqueta ? (
              showBothEtiquetas ? (
                <>
                  <button
                    type="button"
                    className="exp-wb-urgency-toggle inline-flex items-center gap-1 text-[12px] disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void handleEmitEtiqueta('correios')}
                    disabled={emittingEtiqueta !== null || cancellingEtiqueta}
                  >
                    {emittingEtiqueta === 'correios' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Tag className="h-3.5 w-3.5" />
                    )}
                    Etiqueta Correios
                  </button>
                  <button
                    type="button"
                    className="exp-wb-urgency-toggle inline-flex items-center gap-1 text-[12px] disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void handleEmitEtiqueta('erp')}
                    disabled={emittingEtiqueta !== null || cancellingEtiqueta}
                  >
                    {emittingEtiqueta === 'erp' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Tag className="h-3.5 w-3.5" />
                    )}
                    Etiqueta ERP
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="exp-wb-urgency-toggle inline-flex items-center gap-1 text-[12px] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void handleEmitEtiqueta()}
                  disabled={emittingEtiqueta !== null || cancellingEtiqueta}
                >
                  {emittingEtiqueta ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Tag className="h-3.5 w-3.5" />
                  )}
                  Etiqueta
                </button>
              )
            ) : null}
            {canCancelCorreiosEtiqueta ? (
              <button
                type="button"
                className="exp-wb-urgency-toggle inline-flex items-center gap-1 text-[12px] text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void handleCancelCorreiosEtiqueta()}
                disabled={cancellingEtiqueta || emittingEtiqueta !== null}
              >
                {cancellingEtiqueta ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Cancelar
              </button>
            ) : null}
          </div>
          {etiquetaError ? (
            <p className="exp-wb-order-header-error text-[12px] text-red-500">{etiquetaError}</p>
          ) : null}
        </div>
        <div className="pedido-header-row2 pedido-entrega exp-wb-order-header-delivery--mobile md:hidden">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>Entrega:</span>
          <span>
            {order.requestedDeliveryDate
              ? formatDayDisplay(order.requestedDeliveryDate)
              : 'não informada'}
          </span>
          {overdue !== null ? (
            <span className="badge-atrasado exp-wb-late-badge shrink-0">
              {formatOverdueLabel(overdue)}
            </span>
          ) : null}
        </div>
      </div>

      {separationTotals.ordered > 0 ? (
        <p className="exp-wb-order-sep-summary mt-1.5 text-[12px] text-[var(--text-secondary)]">
          Separação: {separationTotals.picked} de {separationTotals.ordered} unidades
          {separationTotals.missing > 0
            ? ` — faltam ${separationTotals.missing}`
            : ' — completo'}
          {separationTotals.shipped > 0
            ? ` · ${separationTotals.shipped} já expedida${
                separationTotals.shipped > 1 ? 's' : ''
              }`
            : ''}
        </p>
      ) : null}

      {saidas.length > 0 ? (
        <div className="mt-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            Saídas registradas ({saidas.length})
          </p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {saidas.map((saida) => (
              <li
                key={saida.id}
                className="flex flex-wrap items-center gap-x-1.5 text-[12px] text-[var(--text-primary)]"
              >
                <span className="font-semibold">
                  {saida.invoiceNumber?.trim()
                    ? `NF ${saida.invoiceNumber.trim()}`
                    : 'Saída'}
                </span>
                {saida.exitDate ? (
                  <span className="text-[var(--text-secondary)]">
                    · {formatDayDisplay(saida.exitDate)}
                  </span>
                ) : null}
                {saida.invoiceValue ? (
                  <span className="text-[var(--text-secondary)]">
                    · {formatOrderItemSaleValue(saida.invoiceValue)}
                  </span>
                ) : null}
                {saida.carrierName?.trim() ? (
                  <span className="text-[var(--text-secondary)]">
                    · {saida.carrierName.trim()}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="exp-wb-order-header-body">
        <div className="exp-wb-order-parties-grid">
          {isSimpleCustomerLayout ? (
            <>
              <PartyCell label="Cliente" value={simpleCliente} />
              <PartyCell
                label="Endereço"
                value={simpleEndereco}
                multiline
              />
              {!hideDuplicateReceiverPoint ? (
                <>
                  <PartyCell label="Recebedor" value={receiver} />
                  <PartyCell label="Ponto de descarga" value={point} />
                </>
              ) : null}
            </>
          ) : (
            <>
              <PartyCell
                label="Comprador (CNPJ)"
                value={
                  order.customerName?.trim()
                    ? `${order.customerName.trim()} — ${cnpj}`
                    : cnpj
                }
              />
              <PartyCell label="Endereço" value={address} multiline />
              <PartyCell label="Recebedor" value={receiver} />
              <PartyCell label="Ponto de descarga" value={point} />
            </>
          )}
        </div>

        <div className="exp-wb-order-obs-compact" title={notes ?? undefined}>
          <span className="exp-wb-order-obs-icon" aria-hidden>
            📝
          </span>
          <span className="exp-wb-order-obs-text">{notes ?? '—'}</span>
        </div>

        <div className="exp-wb-order-header-block exp-wb-order-header-block--transport !p-2">
          <div className="exp-wb-transport-grid">
            <HeaderField label="Transportadora:">
              {onCarrierChange && !fieldsReadOnly ? (
                <div className="flex items-center gap-1.5">
                  <div className="min-w-0 flex-1">
                    <PremiumSelect
                      value={order.carrierId ?? ''}
                      onChange={(value) => {
                        void onCarrierChange(value.trim() ? value : null);
                      }}
                      options={carrierOptions}
                      placeholder="Selecionar…"
                      disabled={carrierSaving || carriersLoading}
                    />
                  </div>
                  {carrierSaving || carriersLoading ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--text-secondary)]" />
                  ) : null}
                </div>
              ) : (
                <span>{displayOrDash(order.carrierName)}</span>
              )}
            </HeaderField>

            {!hideVolumes && !isSimpleCustomerLayout ? (
              <HeaderField label="Volumes:">
                {isOrdersMode || fieldsReadOnly ? (
                  <span>
                    {order.volumes != null && order.volumes >= 1
                      ? `${order.volumes} volume${order.volumes > 1 ? 's' : ''}`
                      : '—'}
                  </span>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        value={volumesInput}
                        onChange={(e) => {
                          setVolumesInput(e.target.value);
                          setVolumesError(null);
                        }}
                        onBlur={() => {
                          const parsed = parseVolumesInput(volumesInput);
                          if (parsed !== null) {
                            void saveVolumes(parsed);
                          }
                        }}
                        disabled={savingVolumes}
                        placeholder="Mín. 1"
                        className={inputClassName}
                      />
                      {savingVolumes ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--text-secondary)]" />
                      ) : null}
                    </div>
                    {volumesError ? (
                      <p className="mt-1 text-xs text-red-500">{volumesError}</p>
                    ) : showFinalizeVolumesHint ? (
                      <p className="mt-1 text-xs text-[var(--color-text-secondary,var(--text-secondary))]">
                        Obrigatório para finalizar.
                      </p>
                    ) : null}
                  </>
                )}
              </HeaderField>
            ) : null}

            <HeaderField label="Nota de Venda (NF):">
              {!canEditInvoiceField ? (
                <span>{notaVenda ?? '—'}</span>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={notaVendaInput}
                      onChange={(e) => {
                        setNotaVendaInput(e.target.value);
                        setNotaVendaError(null);
                      }}
                      onBlur={() => void saveNotaVenda()}
                      disabled={savingNotaVenda}
                      placeholder="NF oficial (opcional)"
                      className={inputClassName}
                    />
                    {savingNotaVenda ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--text-secondary)]" />
                    ) : null}
                  </div>
                  {notaVendaError ? (
                    <p className="mt-1 text-xs text-red-500">{notaVendaError}</p>
                  ) : null}
                </>
              )}
            </HeaderField>

            <button
              type="button"
              className="exp-wb-nf-history mt-2 w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)]/40 p-3 text-left transition hover:bg-[var(--input-bg)]/70 disabled:cursor-default disabled:opacity-80"
              style={{ borderWidth: 1, borderRadius: 8, padding: 12 }}
              onClick={() => {
                if (!nfHistoricoLoading) {
                  setNfHistoricoModalOpen(true);
                }
              }}
              disabled={nfHistoricoLoading}
              aria-label="Abrir histórico de notas fiscais"
            >
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Histórico de Notas Fiscais
              </p>
              {nfHistoricoLoading ? (
                <p className="mt-2 text-xs text-[var(--text-secondary)]">Carregando…</p>
              ) : nfHistorico.length === 0 ? (
                <p className="mt-2 text-xs text-[var(--text-secondary)]">
                  Nenhuma NF vinculada a este pedido.
                </p>
              ) : (
                <>
                  <ul className="mt-2 flex flex-col gap-1">
                    {nfHistorico.map((row) => (
                      <li
                        key={row.id}
                        className="font-mono text-sm font-semibold text-[var(--text-primary)]"
                      >
                        NF {row.invoiceNumber}
                      </li>
                    ))}
                  </ul>
                  <p
                    className="mt-2"
                    style={{ fontSize: 11, color: 'gray', cursor: 'pointer' }}
                  >
                    Clique para ver e editar
                  </p>
                </>
              )}
            </button>

            {nfHistoricoModalOpen ? (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay)] p-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby="nf-historico-modal-title"
              >
                <div
                  className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 shadow-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex shrink-0 items-start justify-between gap-3">
                    <div>
                      <h3
                        id="nf-historico-modal-title"
                        className="text-base font-semibold text-[var(--text-primary)]"
                      >
                        Histórico de Notas Fiscais
                      </h3>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        Notas vinculadas a este pedido. Clique em Editar para corrigir número, valor ou data.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg border border-[var(--border-color)] p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      onClick={() => {
                        setNfHistoricoModalOpen(false);
                        closeNfForm();
                        setNfHistoricoSearchResults(null);
                        setNfHistoricoSearch('');
                      }}
                      aria-label="Fechar"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      disabled={savingNfHistory || isFinalized}
                      onClick={openAddNfHistory}
                    >
                      + Adicionar Nota Fiscal
                    </button>
                    <div className="flex min-w-0 flex-1 gap-2">
                      <input
                        className="min-w-0 flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                        placeholder="Buscar NF, pedido ou CNPJ (global)…"
                        value={nfHistoricoSearch}
                        onChange={(e) => setNfHistoricoSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void runNfHistoricoSearch();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-60"
                        disabled={nfHistoricoSearchLoading}
                        onClick={() => void runNfHistoricoSearch()}
                      >
                        {nfHistoricoSearchLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        Buscar
                      </button>
                    </div>
                  </div>
                  {nfHistoricoSearchResults ? (
                    <button
                      type="button"
                      className="mt-2 shrink-0 self-start text-xs font-medium text-[var(--accent)] hover:underline"
                      onClick={() => {
                        setNfHistoricoSearchResults(null);
                        setNfHistoricoSearch('');
                      }}
                    >
                      Voltar ao histórico deste pedido
                    </button>
                  ) : null}

                  {addingNf || editingNfHistory ? (
                    <div className="mt-3 shrink-0 space-y-2 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)]/50 p-3">
                      <p className="text-xs font-semibold text-[var(--text-primary)]">
                        {addingNf
                          ? 'Nova Nota Fiscal'
                          : `Editar NF${
                              editingNfHistory?.orderNumber
                                ? ` · Pedido ${editingNfHistory.orderNumber}`
                                : ''
                            }`}
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <label className="block text-xs text-[var(--text-secondary)] sm:col-span-1">
                          Número da NF
                          <input
                            className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                            value={editNfNumber}
                            onChange={(e) => setEditNfNumber(e.target.value)}
                            disabled={savingNfHistory}
                            autoFocus
                          />
                        </label>
                        <label className="block text-xs text-[var(--text-secondary)]">
                          Valor (R$)
                          <input
                            className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                            value={editNfValue}
                            onChange={(e) => setEditNfValue(e.target.value)}
                            disabled={savingNfHistory}
                            placeholder="0.00"
                          />
                        </label>
                        <label className="block text-xs text-[var(--text-secondary)]">
                          Data de saída
                          <input
                            type="date"
                            className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                            value={editNfDate}
                            onChange={(e) => setEditNfDate(e.target.value)}
                            disabled={savingNfHistory}
                          />
                        </label>
                      </div>
                      {!addingNf ? (
                        <label className="block text-xs text-[var(--text-secondary)]">
                          Qtd. separada no momento
                          <input
                            type="number"
                            min={0}
                            className="mt-1 w-full max-w-[140px] rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                            value={editNfPickedQty}
                            onChange={(e) => setEditNfPickedQty(e.target.value)}
                            disabled={savingNfHistory}
                          />
                        </label>
                      ) : null}
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs"
                          disabled={savingNfHistory}
                          onClick={closeNfForm}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                          disabled={savingNfHistory}
                          onClick={() => void saveEditNfHistory()}
                        >
                          {savingNfHistory ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          Salvar
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
                    {(nfHistoricoSearchResults ?? nfHistorico).length === 0 ? (
                      <li className="rounded-lg border border-dashed border-[var(--border-color)] px-3 py-4 text-center text-sm text-[var(--text-secondary)]">
                        Nenhuma NF neste histórico.
                        {!isFinalized ? ' Use “+ Adicionar Nota Fiscal”.' : null}
                      </li>
                    ) : (
                      (nfHistoricoSearchResults ?? nfHistorico).map((row) => (
                        <li
                          key={row.id}
                          className="flex items-start justify-between gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)]/40 px-3 py-2.5 text-sm text-[var(--text-primary)]"
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left hover:opacity-90"
                            onClick={() => openEditNfHistory(row)}
                            title="Clique para editar"
                          >
                            <span className="block font-mono text-sm font-semibold">
                              NF {row.invoiceNumber}
                            </span>
                            <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">
                              {formatMoneyBrl(row.invoiceValue)} ·{' '}
                              {new Date(row.createdAt).toLocaleDateString('pt-BR')} ·{' '}
                              {row.pickedQtyAtTime} un.
                              {row.orderNumber ? ` · Pedido ${row.orderNumber}` : ''}
                            </span>
                          </button>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--input-bg)] disabled:opacity-50"
                              disabled={savingNfHistory}
                              onClick={() => openEditNfHistory(row)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Editar
                            </button>
                            {!isFinalized && !nfHistoricoSearchResults ? (
                              <button
                                type="button"
                                className="rounded-lg border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                                title={`Remover NF ${row.invoiceNumber}`}
                                aria-label={`Remover NF ${row.invoiceNumber} do histórico`}
                                disabled={
                                  deletingNfHistoryId === row.id || clearingNfHistorico
                                }
                                onClick={() => void deleteNfHistoricoItem(row)}
                              >
                                {deletingNfHistoryId === row.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </button>
                            ) : null}
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                  {!isFinalized &&
                  !nfHistoricoSearchResults &&
                  nfHistorico.length > 0 ? (
                    <div className="mt-3 flex shrink-0 justify-end">
                      <button
                        type="button"
                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        disabled={clearingNfHistorico || Boolean(deletingNfHistoryId)}
                        onClick={() => void clearNfHistorico()}
                      >
                        {clearingNfHistorico ? 'Limpando…' : 'Limpar histórico'}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {canEditTrackingCode ? (
              <HeaderField label="Código de Rastreio:">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={trackingCodeInput}
                    onChange={(e) => {
                      setTrackingCodeInput(e.target.value);
                      setTrackingCodeError(null);
                    }}
                    disabled={savingTrackingCode}
                    placeholder="Digite o código"
                    className={inputClassName}
                  />
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--border-color)] px-2 py-1.5 text-xs font-semibold text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void saveTrackingCode()}
                    disabled={savingTrackingCode}
                  >
                    {savingTrackingCode ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      'Salvar'
                    )}
                  </button>
                </div>
                {trackingCodeError ? (
                  <p className="mt-1 text-xs text-red-500">{trackingCodeError}</p>
                ) : null}
              </HeaderField>
            ) : null}

            {!isSiteOrder ? (
              <HeaderField label="Nota de Remessa:">
                {fieldsReadOnly ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{notaRemessa.trim() || '—'}</span>
                    {order.notaRemessaConfirmada ? (
                      <span className="exp-wb-line-status exp-wb-line-status--recebido">
                        Confirmada
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={notaRemessa}
                      onChange={(e) => {
                        setNotaRemessa(e.target.value);
                        setNotaRemessaError(null);
                      }}
                      onBlur={() => void saveNotaRemessa()}
                      disabled={savingNotaRemessa}
                      placeholder="Número da remessa"
                      className={inputClassName}
                    />
                    {savingNotaRemessa ? (
                      <Loader2 className="mt-1 h-3.5 w-3.5 animate-spin text-[var(--text-secondary)]" />
                    ) : null}
                    {notaRemessaError ? (
                      <p className="mt-1 text-[12px] text-red-500">{notaRemessaError}</p>
                    ) : null}
                  </>
                )}
              </HeaderField>
            ) : null}
          </div>
          {!isSiteOrder && !fieldsReadOnly ? (
            <label className="exp-wb-remessa-confirm">
              <input
                type="checkbox"
                checked={notaRemessaConfirmada}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setNotaRemessaConfirmada(checked);
                  void saveNotaRemessa({ confirmed: checked });
                }}
                disabled={savingNotaRemessa}
                className="h-3.5 w-3.5 accent-[var(--accent)]"
              />
              Confirmar nota de remessa
            </label>
          ) : null}
        </div>
      </div>

      <ExistingEtiquetaChoiceModal
        open={existingEtiquetaModalOpen}
        trackingCode={existingEtiquetaCode}
        busy={emittingEtiqueta !== null || exitingWithExistingEtiqueta}
        onChoice={handleExistingEtiquetaChoice}
      />

      {reviewSuggestion ? (
        <UrgentLinkSuggestionModal
          numeroPed={numeroPedFromOrder(order) || order.code}
          baseLabel={numero}
          suggestion={reviewSuggestion}
          baseTotalValue={vinculoBaseTotal}
          baseReceiver={order.receiverName}
          onClose={() => setReviewSuggestion(null)}
          onDiscard={() => {
            setDiscardedSuggestionIds((prev) => {
              const next = new Set(prev);
              next.add(reviewSuggestion.orderId);
              return next;
            });
            setReviewSuggestion(null);
          }}
          onConfirmed={async () => {
            setReviewSuggestion(null);
            setVinculoSuggestions([]);
            onStatusChanged?.();
          }}
          onError={(message) => setVinculoError(message)}
        />
      ) : null}
    </div>
  );
});
