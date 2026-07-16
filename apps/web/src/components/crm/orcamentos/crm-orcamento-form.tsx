'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { CrmOrcamentoProductsSection } from '@/src/components/crm/orcamentos/crm-orcamento-products';
import { CrmOrcamentoProposalsTab } from '@/src/components/crm/orcamentos/crm-orcamento-proposals-tab';
import { CrmOrcamentoRichText } from '@/src/components/crm/orcamentos/crm-orcamento-rich-text';
import { CrmOrcamentoSendProposalModal } from '@/src/components/crm/orcamentos/crm-orcamento-send-proposal-modal';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
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

type CarrierOption = {
  id: string;
  name: string;
  isActive?: boolean;
};

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
  };
}

export function CrmOrcamentoForm(props: {
  quote: QuoteDto | null;
  users: CrmUserDto[];
  onBack: () => void;
  onSaved: (quote: QuoteDto) => void;
}) {
  const router = useRouter();
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
  const [carriers, setCarriers] = useState<CarrierOption[]>([]);
  const [personSearch, setPersonSearch] = useState('');
  const [personResults, setPersonResults] = useState<QuotePersonSearchResult[]>([]);
  const [personLoading, setPersonLoading] = useState(false);
  const [personPickerOpen, setPersonPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentQuote(props.quote);
    setForm(props.quote ? fromQuote(props.quote) : emptyForm());
    setPersonSearch(props.quote?.customerName ?? '');
  }, [props.quote]);

  useEffect(() => {
    const controller = new AbortController();
    void erpFetchJson<CarrierOption[]>('cadastros/carriers')
      .then((carr) => {
        if (controller.signal.aborted) return;
        setCarriers(carr.filter((c) => c.isActive !== false));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Falha ao carregar cadastros.');
      });
    return () => controller.abort();
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
    return {
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

  const displaySubtotal = currentQuote?.subtotal ?? form.subtotal;
  const displayTotal = currentQuote?.total ?? form.total;

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

        {currentQuote ? (
          <CrmOrcamentoProductsSection
            quote={currentQuote}
            onQuoteChange={(quote) => {
              setCurrentQuote(quote);
              setForm((prev) => ({
                ...prev,
                subtotal: quote.subtotal,
                total: quote.total,
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
          <h3 className="mb-3 text-sm font-semibold text-[var(--erp-fg)]">Entrega</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
              Transportadora
              <select
                value={form.carrierId}
                onChange={(e) => setField('carrierId', e.target.value)}
                className="erp-module-input mt-1"
              >
                <option value="">Selecione</option>
                {carriers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-[var(--erp-fg-muted)] sm:col-span-2">
              Endereço
              <input
                value={form.deliveryAddress}
                onChange={(e) => setField('deliveryAddress', e.target.value)}
                className="erp-module-input mt-1"
              />
            </label>
            <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
              Valor frete
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.freightValue}
                disabled={form.freightToConsult}
                onChange={(e) => setField('freightValue', e.target.value)}
                className="erp-module-input mt-1 disabled:opacity-50"
              />
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm text-[var(--erp-fg)]">
              <input
                type="checkbox"
                checked={form.freightToConsult}
                onChange={(e) => setField('freightToConsult', e.target.checked)}
                className="h-4 w-4 rounded border-[var(--erp-border)]"
              />
              A consultar
            </label>
            <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
              Prazo
              <input
                value={form.deliveryDeadline}
                onChange={(e) => setField('deliveryDeadline', e.target.value)}
                className="erp-module-input mt-1"
                placeholder="Ex: 5 dias úteis"
              />
            </label>
            <label className="block text-xs font-medium text-[var(--erp-fg-muted)]">
              Tipo frete
              <input
                value={form.freightType}
                onChange={(e) => setField('freightType', e.target.value)}
                className="erp-module-input mt-1"
                placeholder="CIF / FOB / etc."
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
