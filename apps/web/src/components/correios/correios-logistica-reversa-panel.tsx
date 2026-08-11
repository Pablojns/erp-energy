'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Package, RotateCcw, Search, Trash2, XCircle } from 'lucide-react';
import { parseDeliveryAddress } from '@/src/components/cadastros/delivery-address';
import {
  InventoryProductPickerModal,
  type InventoryProductOption,
} from '@/src/components/expedicao/workspace/inventory-product-picker-modal';
import {
  formatCepInput,
  formatEtiquetaDate,
  reverseLogisticsStatusLabel,
  REVERSE_LOGISTICS_STATUSES,
} from '@/src/components/correios/correios-helpers';
import {
  cancelarReverseLogistics,
  createReverseLogistics,
  excluirReverseLogistics,
  gerarRotuloCorreios,
  getCorreiosRemetentePadrao,
  listReverseLogistics,
  receberReverseLogistics,
  type ReverseLogisticsDto,
} from '@/src/services/api/correios-api';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

type CustomerOption = {
  id: string;
  name: string;
  document?: string | null;
  email?: string | null;
  deliveryAddress?: string | null;
};

type CompanyEntityOption = {
  id: string;
  name: string;
  cnpj: string;
  endereco: string | null;
  isMatriz: boolean;
  isActive: boolean;
};

function emptyCompanyForm() {
  return {
    companyEntityId: '',
    companyName: '',
    companyCnpj: '',
    companyCep: '',
    companyLogradouro: '',
    companyNumero: '',
    companyComplemento: '',
    companyBairro: '',
    companyCidade: '',
    companyUf: '',
  };
}

export function CorreiosLogisticaReversaPanel() {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [companies, setCompanies] = useState<CompanyEntityOption[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerCnpj, setCustomerCnpj] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerCep, setCustomerCep] = useState('');
  const [customerLogradouro, setCustomerLogradouro] = useState('');
  const [customerNumero, setCustomerNumero] = useState('');
  const [customerComplemento, setCustomerComplemento] = useState('');
  const [customerBairro, setCustomerBairro] = useState('');
  const [customerCidade, setCustomerCidade] = useState('');
  const [customerUf, setCustomerUf] = useState('');

  const [companyEntityId, setCompanyEntityId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyCnpj, setCompanyCnpj] = useState('');
  const [companyCep, setCompanyCep] = useState('');
  const [companyLogradouro, setCompanyLogradouro] = useState('');
  const [companyNumero, setCompanyNumero] = useState('');
  const [companyComplemento, setCompanyComplemento] = useState('');
  const [companyBairro, setCompanyBairro] = useState('');
  const [companyCidade, setCompanyCidade] = useState('');
  const [companyUf, setCompanyUf] = useState('');

  const [product, setProduct] = useState<InventoryProductOption | null>(null);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [servico, setServico] = useState<'PAC' | 'SEDEX'>('PAC');
  const [modalidade, setModalidade] = useState<'AGENCIA' | 'COLETA'>('AGENCIA');
  const [coletaData, setColetaData] = useState('');
  const [coletaPeriodo, setColetaPeriodo] = useState<'MANHA' | 'TARDE' | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);

  const [rows, setRows] = useState<ReverseLogisticsDto[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [acaoId, setAcaoId] = useState<string | null>(null);

  const [receiveTarget, setReceiveTarget] = useState<ReverseLogisticsDto | null>(null);
  const [receiveChoice, setReceiveChoice] = useState<'stock' | 'no-stock' | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  );

  const applyCompanyEntity = useCallback((entity: CompanyEntityOption | null) => {
    if (!entity) {
      const empty = emptyCompanyForm();
      setCompanyEntityId(empty.companyEntityId);
      setCompanyName(empty.companyName);
      setCompanyCnpj(empty.companyCnpj);
      setCompanyCep(empty.companyCep);
      setCompanyLogradouro(empty.companyLogradouro);
      setCompanyNumero(empty.companyNumero);
      setCompanyComplemento(empty.companyComplemento);
      setCompanyBairro(empty.companyBairro);
      setCompanyCidade(empty.companyCidade);
      setCompanyUf(empty.companyUf);
      return;
    }
    setCompanyEntityId(entity.id);
    setCompanyName(entity.name);
    setCompanyCnpj(entity.cnpj);
    const addr = parseDeliveryAddress(entity.endereco);
    if (addr) {
      setCompanyCep(formatCepInput(addr.cep));
      setCompanyLogradouro(addr.logradouro);
      setCompanyNumero(addr.numero);
      setCompanyComplemento(addr.complemento);
      setCompanyBairro(addr.bairro);
      setCompanyCidade(addr.cidade);
      setCompanyUf(addr.uf);
    }
  }, []);

  const loadCompaniesAndPadrao = useCallback(async () => {
    const [entities, padrao] = await Promise.all([
      erpFetchJson<CompanyEntityOption[]>('cadastros/company-entities'),
      getCorreiosRemetentePadrao().catch(() => null),
    ]);
    const active = Array.isArray(entities)
      ? entities.filter((c) => c?.id && c?.isActive !== false)
      : [];
    setCompanies(active);

    const preferred =
      active.find((c) => !c.isMatriz) ?? active.find((c) => c.isMatriz) ?? active[0] ?? null;

    if (preferred) {
      applyCompanyEntity(preferred);
      // Se a entidade não tem endereço, completa com o padrão Correios.
      if (!parseDeliveryAddress(preferred.endereco) && padrao) {
        setCompanyCep(formatCepInput(padrao.cep));
        setCompanyLogradouro(padrao.logradouro);
        setCompanyNumero(padrao.numero || 'S/N');
        setCompanyComplemento(padrao.complemento ?? '');
        setCompanyBairro(padrao.bairro);
        setCompanyCidade(padrao.cidade);
        setCompanyUf(padrao.uf);
        if (!preferred.name) setCompanyName(padrao.nome);
        if (!preferred.cnpj) setCompanyCnpj(padrao.cpfCnpj);
      }
    } else if (padrao) {
      setCompanyName(padrao.nome);
      setCompanyCnpj(padrao.cpfCnpj);
      setCompanyCep(formatCepInput(padrao.cep));
      setCompanyLogradouro(padrao.logradouro);
      setCompanyNumero(padrao.numero || 'S/N');
      setCompanyComplemento(padrao.complemento ?? '');
      setCompanyBairro(padrao.bairro);
      setCompanyCidade(padrao.cidade);
      setCompanyUf(padrao.uf);
    }
  }, [applyCompanyEntity]);

  const loadCustomers = useCallback(async () => {
    const data = await erpFetchJson<CustomerOption[]>('cadastros/customers');
    setCustomers(Array.isArray(data) ? data.filter((c) => c?.id && c?.name) : []);
  }, []);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const data = await listReverseLogistics({
        status: filterStatus || undefined,
        customer: filterCustomer.trim() || undefined,
        from: filterFrom || undefined,
        to: filterTo || undefined,
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Falha ao listar devoluções.');
    } finally {
      setLoadingList(false);
    }
  }, [filterStatus, filterCustomer, filterFrom, filterTo]);

  useEffect(() => {
    void loadCustomers().catch(() => undefined);
    void loadCompaniesAndPadrao().catch(() => undefined);
    void loadList();
  }, [loadCustomers, loadCompaniesAndPadrao, loadList]);

  useEffect(() => {
    if (!selectedCustomer) return;
    setCustomerName(selectedCustomer.name);
    setCustomerCnpj(selectedCustomer.document ?? '');
    setCustomerEmail(selectedCustomer.email ?? '');
    const addr = parseDeliveryAddress(selectedCustomer.deliveryAddress);
    if (!addr) return;
    setCustomerCep(formatCepInput(addr.cep));
    setCustomerLogradouro(addr.logradouro);
    setCustomerNumero(addr.numero);
    setCustomerComplemento(addr.complemento);
    setCustomerBairro(addr.bairro);
    setCustomerCidade(addr.cidade);
    setCustomerUf(addr.uf);
  }, [selectedCustomer]);

  const handleCreate = async () => {
    setSubmitting(true);
    setFormError(null);
    setFormOk(null);
    try {
      if (!product) {
        setFormError('Selecione o produto.');
        return;
      }
      const qty = Number(quantity);
      if (!Number.isInteger(qty) || qty < 1) {
        setFormError('Quantidade deve ser um inteiro maior que zero.');
        return;
      }
      if (!customerName.trim()) {
        setFormError('Informe o cliente (remetente).');
        return;
      }
      if (!companyName.trim() || !companyCnpj.trim()) {
        setFormError('Informe a Energy Brands (destinatário) e o CNPJ.');
        return;
      }
      if (!reason.trim()) {
        setFormError('Informe o motivo da devolução.');
        return;
      }

      const created = await createReverseLogistics({
        customerName: customerName.trim(),
        customerCnpj: customerCnpj.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
        customerCep,
        customerLogradouro: customerLogradouro.trim(),
        customerNumero: customerNumero.trim(),
        customerComplemento: customerComplemento.trim() || undefined,
        customerBairro: customerBairro.trim(),
        customerCidade: customerCidade.trim(),
        customerUf: customerUf.trim(),
        companyEntityId: companyEntityId || undefined,
        companyName: companyName.trim(),
        companyCnpj: companyCnpj.trim(),
        companyCep,
        companyLogradouro: companyLogradouro.trim(),
        companyNumero: companyNumero.trim(),
        companyComplemento: companyComplemento.trim() || undefined,
        companyBairro: companyBairro.trim(),
        companyCidade: companyCidade.trim(),
        companyUf: companyUf.trim(),
        productId: product.id,
        quantity: qty,
        reason: reason.trim(),
        servico,
        modalidade,
        coletaDataPreferencial:
          modalidade === 'COLETA' && coletaData ? coletaData : undefined,
        coletaPeriodo:
          modalidade === 'COLETA' && (coletaPeriodo === 'MANHA' || coletaPeriodo === 'TARDE')
            ? coletaPeriodo
            : undefined,
      });

      if (created.prePostagemId) {
        try {
          await gerarRotuloCorreios([created.prePostagemId]);
        } catch {
          /* PDF complementar */
        }
      }

      setFormOk(
        created.trackingCode
          ? `Devolução criada. Rastreio: ${created.trackingCode}`
          : 'Devolução criada e etiqueta gerada nos Correios.',
      );
      setReason('');
      setQuantity('1');
      setProduct(null);
      await loadList();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao criar devolução.');
    } finally {
      setSubmitting(false);
    }
  };

  const openReceive = (row: ReverseLogisticsDto) => {
    setReceiveTarget(row);
    setReceiveChoice(null);
    setReceiveError(null);
  };

  const confirmReceive = async () => {
    if (!receiveTarget || receiveChoice == null) {
      setReceiveError('Escolha se o produto volta ou não ao estoque.');
      return;
    }
    setReceiving(true);
    setReceiveError(null);
    try {
      await receberReverseLogistics(receiveTarget.id, receiveChoice === 'stock');
      setReceiveTarget(null);
      setReceiveChoice(null);
      await loadList();
    } catch (err) {
      setReceiveError(
        err instanceof Error ? err.message : 'Falha ao marcar como recebido.',
      );
    } finally {
      setReceiving(false);
    }
  };

  const handleCancelar = async (row: ReverseLogisticsDto) => {
    const ok = window.confirm(
      `Cancelar a devolução de ${row.customerName}?\n\nCancela a pré-postagem nos Correios e marca o registro como CANCELADO.`,
    );
    if (!ok) return;
    setAcaoId(row.id);
    setListError(null);
    try {
      await cancelarReverseLogistics(row.id);
      await loadList();
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Falha ao cancelar.');
    } finally {
      setAcaoId(null);
    }
  };

  const handleExcluir = async (row: ReverseLogisticsDto) => {
    const ok1 = window.confirm(
      `Excluir este registro do sistema?\n\nCliente: ${row.customerName}\nProduto: ${row.productSku}\n\nNão cancela nos Correios — apenas remove o histórico local.`,
    );
    if (!ok1) return;
    const ok2 = window.confirm(
      'Confirma novamente a exclusão? Esta ação não pode ser desfeita.',
    );
    if (!ok2) return;

    setAcaoId(row.id);
    setListError(null);
    try {
      await excluirReverseLogistics(row.id);
      await loadList();
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Falha ao excluir.');
    } finally {
      setAcaoId(null);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-[var(--text-primary)]';

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[var(--accent)]/10 p-2 text-[var(--accent)]">
            <RotateCcw className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Nova devolução (Logística Reversa)
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Remetente = cliente · Destinatário = Energy Brands. Gera autorização/etiqueta nos Correios.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
              Cliente (remetente da etiqueta)
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-[var(--text-secondary)]">Cliente cadastrado</span>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Selecione…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-[var(--text-secondary)]">Nome</span>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">CNPJ/CPF</span>
                <input
                  value={customerCnpj}
                  onChange={(e) => setCustomerCnpj(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">E-mail</span>
                <input
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">CEP</span>
                <input
                  value={customerCep}
                  onChange={(e) => setCustomerCep(formatCepInput(e.target.value))}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-[var(--text-secondary)]">Logradouro</span>
                <input
                  value={customerLogradouro}
                  onChange={(e) => setCustomerLogradouro(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">Número</span>
                <input
                  value={customerNumero}
                  onChange={(e) => setCustomerNumero(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">Complemento</span>
                <input
                  value={customerComplemento}
                  onChange={(e) => setCustomerComplemento(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">Bairro</span>
                <input
                  value={customerBairro}
                  onChange={(e) => setCustomerBairro(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">Cidade</span>
                <input
                  value={customerCidade}
                  onChange={(e) => setCustomerCidade(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">UF</span>
                <input
                  value={customerUf}
                  onChange={(e) => setCustomerUf(e.target.value.toUpperCase().slice(0, 2))}
                  className={inputClass}
                />
              </label>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
              Energy Brands (destinatário da etiqueta)
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-[var(--text-secondary)]">CNPJ (São Paulo / Londrina)</span>
                <select
                  value={companyEntityId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const entity = companies.find((c) => c.id === id) ?? null;
                    applyCompanyEntity(entity);
                  }}
                  className={inputClass}
                >
                  <option value="">Selecione o CNPJ…</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.isMatriz ? ' · Matriz' : ''} — {c.cnpj}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-[var(--text-secondary)]">Nome</span>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">CNPJ</span>
                <input
                  value={companyCnpj}
                  onChange={(e) => setCompanyCnpj(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">CEP</span>
                <input
                  value={companyCep}
                  onChange={(e) => setCompanyCep(formatCepInput(e.target.value))}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-[var(--text-secondary)]">Logradouro</span>
                <input
                  value={companyLogradouro}
                  onChange={(e) => setCompanyLogradouro(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">Número</span>
                <input
                  value={companyNumero}
                  onChange={(e) => setCompanyNumero(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">Complemento</span>
                <input
                  value={companyComplemento}
                  onChange={(e) => setCompanyComplemento(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">Bairro</span>
                <input
                  value={companyBairro}
                  onChange={(e) => setCompanyBairro(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">Cidade</span>
                <input
                  value={companyCidade}
                  onChange={(e) => setCompanyCidade(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">UF</span>
                <input
                  value={companyUf}
                  onChange={(e) => setCompanyUf(e.target.value.toUpperCase().slice(0, 2))}
                  className={inputClass}
                />
              </label>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 text-sm sm:col-span-2">
              <span className="text-[var(--text-secondary)]">Produto</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setProductPickerOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 font-medium text-[var(--text-primary)] hover:border-[var(--accent)]"
                >
                  <Package className="h-4 w-4" />
                  {product ? `${product.sku} — ${product.name}` : 'Selecionar produto'}
                </button>
                {product ? (
                  <button
                    type="button"
                    onClick={() => setProduct(null)}
                    className="text-sm text-[var(--text-secondary)] underline"
                  >
                    Limpar
                  </button>
                ) : null}
              </div>
            </div>

            <label className="space-y-1 text-sm">
              <span className="text-[var(--text-secondary)]">Quantidade</span>
              <input
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={inputClass}
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-[var(--text-secondary)]">Serviço reverso</span>
              <select
                value={servico}
                onChange={(e) => setServico(e.target.value as 'PAC' | 'SEDEX')}
                className={inputClass}
              >
                <option value="PAC">PAC Reverso</option>
                <option value="SEDEX">SEDEX Reverso</option>
              </select>
            </label>

            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-[var(--text-secondary)]">Modalidade</span>
              <select
                value={modalidade}
                onChange={(e) => setModalidade(e.target.value as 'AGENCIA' | 'COLETA')}
                className={inputClass}
              >
                <option value="AGENCIA">Postar na Agência</option>
                <option value="COLETA">Coletar no Endereço do Cliente</option>
              </select>
            </label>

            {modalidade === 'COLETA' ? (
              <>
                <label className="space-y-1 text-sm">
                  <span className="text-[var(--text-secondary)]">
                    Data preferencial de coleta
                  </span>
                  <input
                    type="date"
                    value={coletaData}
                    onChange={(e) => setColetaData(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-[var(--text-secondary)]">Período</span>
                  <select
                    value={coletaPeriodo}
                    onChange={(e) =>
                      setColetaPeriodo(e.target.value as 'MANHA' | 'TARDE' | '')
                    }
                    className={inputClass}
                  >
                    <option value="">Sem preferência</option>
                    <option value="MANHA">Manhã</option>
                    <option value="TARDE">Tarde</option>
                  </select>
                </label>
              </>
            ) : null}

            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-[var(--text-secondary)]">Motivo</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className={inputClass}
                placeholder="Ex.: defeito no produto, troca, etc."
              />
            </label>
          </div>
        </div>

        {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
        {formOk ? <p className="text-sm text-emerald-700">{formOk}</p> : null}

        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleCreate()}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--color-text-inverse)] disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Gerar etiqueta de devolução
        </button>
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Histórico de devoluções
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Filtros por status, período e cliente.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadList()}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-color)] px-3 py-2 text-sm font-medium text-[var(--text-primary)]"
          >
            <Search className="h-4 w-4" />
            Atualizar
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="text-[var(--text-secondary)]">Status</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className={inputClass}
            >
              <option value="">Todos</option>
              {REVERSE_LOGISTICS_STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[var(--text-secondary)]">Cliente</span>
            <input
              value={filterCustomer}
              onChange={(e) => setFilterCustomer(e.target.value)}
              className={inputClass}
              placeholder="Nome"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[var(--text-secondary)]">De</span>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[var(--text-secondary)]">Até</span>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        {listError ? <p className="text-sm text-red-600">{listError}</p> : null}

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border-color)] text-[var(--text-secondary)]">
              <tr>
                <th className="px-2 py-2 font-medium">Criado</th>
                <th className="px-2 py-2 font-medium">Cliente</th>
                <th className="px-2 py-2 font-medium">Destino</th>
                <th className="px-2 py-2 font-medium">Produto</th>
                <th className="px-2 py-2 font-medium">Modalidade</th>
                <th className="px-2 py-2 font-medium">Rastreio</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Estoque</th>
                <th className="px-2 py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loadingList ? (
                <tr>
                  <td colSpan={9} className="px-2 py-6 text-[var(--text-secondary)]">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                    </span>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-2 py-6 text-[var(--text-secondary)]">
                    Nenhuma devolução encontrada.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--border-color)]/70">
                    <td className="whitespace-nowrap px-2 py-2">
                      {formatEtiquetaDate(row.createdAt)}
                    </td>
                    <td className="px-2 py-2">{row.customerName}</td>
                    <td className="px-2 py-2">
                      <div>{row.companyName || '—'}</div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        {row.companyCnpj || ''}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="font-medium">{row.productSku}</div>
                      <div className="text-[var(--text-secondary)]">
                        {row.productName} · {row.quantity}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      {row.modalidade === 'COLETA' ? 'Coleta' : 'Agência'}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">
                      {row.trackingCode || '—'}
                    </td>
                    <td className="px-2 py-2">
                      {reverseLogisticsStatusLabel(row.status)}
                    </td>
                    <td className="px-2 py-2">
                      {row.status === 'RECEBIDO'
                        ? row.returnedToStock
                          ? 'Devolvido'
                          : 'Não devolvido'
                        : '—'}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {row.status !== 'RECEBIDO' && row.status !== 'CANCELADO' ? (
                          <button
                            type="button"
                            onClick={() => openReceive(row)}
                            className="rounded-lg border border-[var(--border-color)] px-2 py-1 text-xs font-semibold hover:border-[var(--accent)]"
                          >
                            Recebido
                          </button>
                        ) : null}
                        {row.status !== 'RECEBIDO' && row.status !== 'CANCELADO' ? (
                          <button
                            type="button"
                            disabled={acaoId === row.id}
                            onClick={() => void handleCancelar(row)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] px-2 py-1 text-xs font-semibold hover:border-amber-500"
                          >
                            <XCircle className="h-3 w-3" />
                            Cancelar
                          </button>
                        ) : null}
                        {row.prePostagemId ? (
                          <button
                            type="button"
                            onClick={() => void gerarRotuloCorreios([row.prePostagemId!])}
                            className="rounded-lg border border-[var(--border-color)] px-2 py-1 text-xs font-semibold hover:border-[var(--accent)]"
                          >
                            PDF
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={acaoId === row.id}
                          onClick={() => void handleExcluir(row)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] px-2 py-1 text-xs font-semibold text-rose-600 hover:border-rose-500"
                        >
                          <Trash2 className="h-3 w-3" />
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <InventoryProductPickerModal
        open={productPickerOpen}
        onClose={() => setProductPickerOpen(false)}
        onSelect={(p) => {
          setProduct(p);
          setProductPickerOpen(false);
        }}
      />

      {receiveTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">
              Marcar como recebido
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              {receiveTarget.productSku} · {receiveTarget.quantity} un. ·{' '}
              {receiveTarget.customerName}
            </p>
            <p className="text-sm text-[var(--text-primary)]">
              Escolha explicitamente o que fazer com o estoque:
            </p>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border-color)] p-3 has-[:checked]:border-[var(--accent)]">
                <input
                  type="radio"
                  name="returnToStock"
                  checked={receiveChoice === 'stock'}
                  onChange={() => setReceiveChoice('stock')}
                  className="mt-1"
                />
                <span>
                  <span className="block font-semibold text-[var(--text-primary)]">
                    Devolver ao estoque
                  </span>
                  <span className="text-sm text-[var(--text-secondary)]">
                    Cria movimentação de entrada e aumenta o saldo do produto.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border-color)] p-3 has-[:checked]:border-[var(--accent)]">
                <input
                  type="radio"
                  name="returnToStock"
                  checked={receiveChoice === 'no-stock'}
                  onChange={() => setReceiveChoice('no-stock')}
                  className="mt-1"
                />
                <span>
                  <span className="block font-semibold text-[var(--text-primary)]">
                    Não devolver ao estoque
                  </span>
                  <span className="text-sm text-[var(--text-secondary)]">
                    Apenas marca como recebido, sem alterar o estoque.
                  </span>
                </span>
              </label>
            </div>
            {receiveError ? <p className="text-sm text-red-600">{receiveError}</p> : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={receiving}
                onClick={() => setReceiveTarget(null)}
                className="rounded-xl border border-[var(--border-color)] px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={receiving || receiveChoice == null}
                onClick={() => void confirmReceive()}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--color-text-inverse)] disabled:opacity-60"
              >
                {receiving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
