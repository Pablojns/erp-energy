import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InvoiceStatus,
  OrderItemStockStatus,
  OrderSource,
  OrderStatus,
  Prisma,
} from '@erp/database';
import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import { createHmac, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { R2StorageService } from '../storage/r2-storage.service';
import { FinanceiroService } from './financeiro.service';
import {
  CONTA_AZUL_API_BASE,
  CONTA_AZUL_API_TOKEN,
  CONTA_AZUL_AUTH_TOKEN,
  CONTA_AZUL_REAUTH_MESSAGE,
  CONTA_AZUL_SESSION_ID,
  basicAuthHeader,
  buildContaAzulAuthorizeUrl,
  decideAfterInvalidGrant,
  expiryFromExpiresIn,
  firstArrayItem,
  fromDbSessionTimestamp,
  invoiceDigits,
  isAccessTokenExpired,
  isContaAzulInvalidGrant,
  newOauthState,
  objectKeys,
  type ContaAzulTokenResponse,
} from './conta-azul.auth';
import {
  mapContaAzulNf,
  reconcileContaAzulNfs,
  type CaNfResumo,
  type ErpNfResumo,
} from './conta-azul.reconcile';
import {
  groupTitulosByDay,
  mapContaAzulPagar,
  mapContaAzulReceber,
  tituloFromDbRow,
  type CaTitulo,
} from './conta-azul.titulos';
import {
  danfeDownloadFilename,
  detectCaNfFile,
  extractNfeXml,
  invoiceDescricaoMatchPattern,
  nfNumberKey,
  nfeDownloadFilename,
  nfeStorageKey,
  tituloMatchesInvoiceNumber,
  xmlToDanfePdf,
} from './conta-azul.nfe-download';
import {
  displayInvoiceNumber,
  displayPedidoNumero,
  invoiceNumberDigitList,
  invoiceNumberDigits,
  invoiceNumberMatchesRemessa,
} from '../orders/order-search';
import {
  documentDigits,
  mapContaAzulPessoa,
  mapContaAzulPessoaParaPedido,
  orderNeedsPedidoCadastroFill,
  planErpCadastroApply,
  planPessoasDivergencias,
  planPreencherPedidosCadastro,
  type CaPessoa,
  type CadastroSyncOrderInput,
  type ErpCadastroMutation,
  type ErpPartyInput,
  type PedidoCadastroPreview,
  type PessoaDivergence,
} from './conta-azul.pessoas';
import {
  mapContaAzulCategoria,
  mapContaAzulCentroCusto,
  type CaCatalogoItem,
} from './conta-azul.catalogos';
import {
  mapContaAzulVenda,
  planInvoiceFromLinkedVendas,
  planVendaVinculos,
  vendaWegHint,
  type CaVenda,
  type InvoiceFillDivergencia,
  type InvoiceFillPreview,
  type VendaSemMatch,
  type VendaVinculoPreview,
} from './conta-azul.vendas';
import {
  planNfVinculoAudit,
  planOldCompletedCleanup,
  type AuditOrderInput,
} from './conta-azul.nf-vinculo-audit';
import { mapLimit } from './conta-azul.pool';
import { nfeEmitidaEmDate, parseNfeXml, type NfeXmlDados } from './conta-azul.nfe-xml';
import {
  buildProductSkuMap,
  classifyXmlVendas,
  planCaso1Completar,
  planCaso2Criar,
  reclassifyByInvoice,
  type Caso1Plan,
  type Caso2Plan,
  type ErpOrderForXml,
  type XmlVendaSkip,
} from './conta-azul.vendas-xml';
import { ExternalItemsService } from '../external-items/external-items.service';
import {
  planWrongWegItemReplaces,
  type ItemReplacePatch,
} from './conta-azul.itens-externos-xml';

type StoredSession = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresAt: Date;
};

type StoredTituloRow = {
  contaAzulId: string;
  tipo: string;
  origem: string;
  numero: string | null;
  descricao: string;
  contraParte: string | null;
  documento: string | null;
  valor: unknown;
  valorPago: unknown;
  valorAberto: unknown;
  vencimento: Date;
  competencia: Date | null;
  status: string;
  pago: boolean;
};

function rowToTitulo(row: StoredTituloRow): CaTitulo {
  return tituloFromDbRow(row);
}

export type CaSyncJobStatus = 'processando' | 'concluido' | 'erro';

export type CaSyncJobResult = {
  ok: true;
  receber: number;
  pagar: number;
  nfs: number;
  financeiroAtualizados: number;
  lastSyncAt: string;
};

export type CaSyncJobState = {
  jobId: string;
  status: CaSyncJobStatus;
  processedWindows: number;
  totalWindows: number;
  message: string;
  result?: CaSyncJobResult;
  error?: string;
};

type CaSyncJobInternal = CaSyncJobState & { createdAt: Date };

export type CaVendasReport = {
  ok: true;
  apply: boolean;
  applied: boolean;
  vendas: number;
  pedidos: number;
  vinculados: number;
  semCorrespondencia: number;
  jaVinculados: number;
  nfsAPreencher: number;
  nfsDivergentes: number;
  porRazao: Record<string, number>;
  previewClaros: VendaVinculoPreview[];
  previewSemMatch: VendaSemMatch[];
  previewNfFill: InvoiceFillPreview[];
  previewNfDivergencias: InvoiceFillDivergencia[];
  appliedCounts?: { pedidosVinculados: number; invoicesPreenchidas: number };
  message: string;
};

export type CaVendasJobState = {
  jobId: string;
  status: CaSyncJobStatus;
  processed: number;
  total: number;
  apply: boolean;
  message: string;
  result?: CaVendasReport;
  error?: string;
};

type CaVendasJobInternal = CaVendasJobState & { createdAt: Date };

export type CaNfVinculoAuditReport = {
  ok: true;
  apply: false;
  vendas: number;
  pedidos: number;
  ordersAffected: number;
  mismatchCount: number;
  byKind: Record<string, number>;
  mismatches: ReturnType<
    typeof import('./conta-azul.nf-vinculo-audit').planNfVinculoAudit
  >['mismatches'];
  oldCompletedCleanup: ReturnType<
    typeof import('./conta-azul.nf-vinculo-audit').planOldCompletedCleanup
  >;
  spotlight: unknown;
  message: string;
};

export type CaNfVinculoAuditJobState = {
  jobId: string;
  status: CaSyncJobStatus;
  processed: number;
  total: number;
  message: string;
  result?: CaNfVinculoAuditReport;
  error?: string;
};

type CaNfVinculoAuditJobInternal = CaNfVinculoAuditJobState & {
  createdAt: Date;
};

export type CaXmlVendasReport = {
  ok: true;
  apply: boolean;
  applied: boolean;
  vendas: number;
  caso1: number;
  caso1Perfeitos: number;
  caso1Completar: number;
  caso1ItensPreenchidos: number;
  caso1ItensAdicionados: number;
  caso2: number;
  caso2Itens: number;
  ambiguos: number;
  semXml: number;
  duplicataEvitada: number;
  previewCaso1: Caso1Plan[];
  previewCaso2: Caso2Plan[];
  previewAmbiguos: XmlVendaSkip[];
  previewSemXml: XmlVendaSkip[];
  previewDuplicatas: XmlVendaSkip[];
  caso1ItensCorrigidos: number;
  appliedCounts?: {
    pedidosCompletados: number;
    itensPreenchidos: number;
    itensAdicionados: number;
    itensCorrigidos: number;
    pedidosCriados: number;
  };
  message: string;
};

export type CaItensExternosXmlCorrection = {
  orderId: string;
  orderCode: string;
  externalOrderNumber: string | null;
  invoiceNumber: string;
  customerName: string;
  itemId: string;
  fromDescription: string;
  toDescription: string;
  fromSku: string;
  toSku: string;
  productName: string | null;
  unitPrice: number;
  createExternalItem: boolean;
  reuseExternalItemId: string | null;
  externalItemName: string;
};

export type CaItensExternosXmlReport = {
  ok: true;
  apply: boolean;
  applied: boolean;
  ordersScanned: number;
  xmlsParsed: number;
  xmlsMissing: number;
  corrections: number;
  preview: CaItensExternosXmlCorrection[];
  appliedCounts?: { itemsUpdated: number; externalItemsCreated: number };
  message: string;
};

export type CaXmlVendasJobState = {
  jobId: string;
  status: CaSyncJobStatus;
  processed: number;
  total: number;
  apply: boolean;
  message: string;
  result?: CaXmlVendasReport;
  error?: string;
};

type CaXmlVendasJobInternal = CaXmlVendasJobState & { createdAt: Date };

export type CaItensExternosXmlJobState = {
  jobId: string;
  status: CaSyncJobStatus;
  processed: number;
  total: number;
  apply: boolean;
  message: string;
  result?: CaItensExternosXmlReport;
  error?: string;
};

type CaItensExternosXmlJobInternal = CaItensExternosXmlJobState & {
  createdAt: Date;
  pedido?: string;
};

export type CaSincronizacaoCompletaReport = {
  ok: true;
  apply: boolean;
  applied: boolean;
  cadastros: {
    criar: { customers: number; suppliers: number; carriers: number };
    atualizar: { customers: number; suppliers: number; carriers: number };
    message: string;
  };
  itensExternos: {
    corrections: number;
    xmlsParsed: number;
    xmlsMissing: number;
    preview: CaItensExternosXmlCorrection[];
    message: string;
  };
  xmlVendas: {
    caso1: number;
    caso1Completar: number;
    caso2: number;
    caso1ItensCorrigidos: number;
    message: string;
  };
  notasAntigas: {
    pending: number;
    saved: number;
    skipped: number;
    preview: Array<{
      orderId: string;
      invoiceNumber: string;
    }>;
    message: string;
  };
  formatoNf: {
    comPrefixoSerie: number;
    preview: Array<{ from: string; to: string }>;
    message: string;
  };
  message: string;
};

export type CaSincronizacaoCompletaJobState = {
  jobId: string;
  status: CaSyncJobStatus;
  processed: number;
  total: number;
  apply: boolean;
  message: string;
  result?: CaSincronizacaoCompletaReport;
  error?: string;
};

type CaSincronizacaoCompletaJobInternal = CaSincronizacaoCompletaJobState & {
  createdAt: Date;
};

const NF_LOOKUP_CONCURRENCY = 8;
const XML_DOWNLOAD_CONCURRENCY = 4;
const XML_VENDAS_NEXT_CODE_LOCK = 94821002;

export const CONTA_AZUL_DOCUMENTED_ENDPOINTS = {
  auth: {
    authorize: 'https://auth.contaazul.com/login',
    tokenCode: CONTA_AZUL_AUTH_TOKEN,
    tokenRefresh: CONTA_AZUL_API_TOKEN,
    scope: 'openid profile aws.cognito.signin.user.admin',
    accessTokenTtl: '3600s',
    refreshTokenTtl: 'até 5 anos; rotaciona a cada refresh',
  },
  notasFiscais: {
    method: 'GET',
    path: '/v1/notas-fiscais',
    query: [
      'data_inicial (YYYY-MM-DD, obrigatório)',
      'data_final (YYYY-MM-DD, obrigatório)',
      'pagina',
      'tamanho_pagina (10|20|50|100)',
      'documento_tomador',
      'numero_nota',
      'id_venda',
    ],
    responseItensDocs: [
      'chave_acesso',
      'data_emissao',
      'nome_destinatario',
      'numero_nota',
      'status (EMITIDA | CORRIGIDA_SUCESSO)',
    ],
    realApiNotes: [
      'Produção e teste: intervalo entre data_inicial e data_final não pode ser > 15 dias (HTTP 400).',
      'Não há data mínima: janelas em 2018–2023 retornam 200 vazias. Datas são obrigatórias (sem filtro = 400).',
      'tamanho_pagina 100 é inseguro: a API pode devolver total_paginas=1 sem entregar todos os itens. Usar 50 e paginar até página curta.',
      'Doc oficial não lista valor da NFe nesta listagem; só usamos valor se o JSON real trouxer o campo.',
    ],
  },
  notasFiscaisServico: {
    method: 'GET',
    path: '/v1/notas-fiscais-servico',
    query: [
      'data_competencia_de (YYYY-MM-DD, obrigatório, máx. 15 dias)',
      'data_competencia_ate (YYYY-MM-DD, obrigatório, máx. 15 dias)',
      'pagina',
      'tamanho_pagina',
    ],
    responseItensDocs: [
      'id',
      'numero_nfse',
      'status',
      'data_competencia',
      'valor_total_nfse',
      'id_venda',
      'nome_cliente',
      'documento_cliente',
    ],
  },
  contasAReceber: {
    method: 'GET',
    path: '/v1/financeiro/eventos-financeiros/contas-a-receber/buscar',
    query: [
      'pagina (obrigatório)',
      'tamanho_pagina (obrigatório)',
      'data_vencimento_de (obrigatório)',
      'data_vencimento_ate (obrigatório)',
      'status[] PERDIDO|RECEBIDO|EM_ABERTO|RENEGOCIADO|RECEBIDO_PARCIAL|ATRASADO',
      'ids_clientes[]',
    ],
    responseItensDocs: [
      'id',
      'descricao',
      'data_vencimento',
      'status / status_traduzido',
      'total',
      'nao_pago',
      'pago',
      'data_competencia',
      'cliente.id',
      'cliente.nome',
      'categorias',
      'centros_de_custo',
    ],
    realApiNotes: [
      'status vem em inglês (PENDING) e status_traduzido em PT (EM_ABERTO).',
      'campo real de centros: centros_de_custo (não centros_custo da doc).',
      'totais reais: pago/vencido/vence_hoje/pendente/aberto.valor + todos.',
    ],
  },
  contasAPagar: {
    method: 'GET',
    path: '/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar',
    query: [
      'pagina (obrigatório)',
      'tamanho_pagina (obrigatório)',
      'data_vencimento_de (obrigatório)',
      'data_vencimento_ate (obrigatório)',
    ],
  },
  pessoas: {
    list: 'GET /v1/pessoas',
    byId: 'GET /v1/pessoas/{id}',
    contaConectada: 'GET /v1/pessoas/conta-conectada',
    responseListDocs: [
      'id',
      'documento',
      'nome',
      'ativo',
      'perfis',
      'endereco (cep, logradouro, numero, complemento, bairro, cidade, estado)',
    ],
    realApiNotes: [
      'Listagem real usa items/totalItems (inglês), não itens/itens_totais.',
      'conta-conectada devolve id_empresa, razao_social, nome_fantasia, documento, email.',
      'Detalhe GET /v1/pessoas/{id} pode trazer enderecos[] e nome_empresa; usado só quando o CNPJ casa com pedido/cliente sem endereço na listagem.',
    ],
  },
  categorias: {
    method: 'GET',
    path: '/v1/categorias',
    query: [
      'pagina (obrigatório)',
      'tamanho_pagina (obrigatório)',
      'permite_apenas_filhos (obrigatório)',
    ],
    smokeTest: true,
  },
  vendas: {
    create: 'POST /v1/venda',
    getById: 'GET /v1/venda/{id}',
    search: 'GET /v1/venda/busca',
    nextNumber: 'GET /v1/venda/proximo-numero',
    sellers: 'GET /v1/venda/vendedores',
    items: 'GET /v1/venda/{id_venda}/itens',
    pdf: 'GET /v1/venda/{id}/imprimir',
    update: 'PUT /v1/venda/{id}',
    deleteBatch: 'POST /v1/venda/exclusao-lote',
    requiredBody: [
      'id_cliente (uuid)',
      'numero (int)',
      'situacao EM_ANDAMENTO|APROVADO',
      'data_venda YYYY-MM-DD',
      'itens[].id (uuid do produto/serviço)',
      'itens[].quantidade',
      'itens[].valor',
      'condicao_pagamento.opcao_condicao_pagamento',
      'condicao_pagamento.parcelas[].data_vencimento',
      'condicao_pagamento.parcelas[].valor',
    ],
    notes: [
      'Cria o registro comercial no ERP Conta Azul. Não emite NF.',
      'Resposta inclui pendencia (ex. AGUARDANDO_CONFIRMACAO), não status fiscal.',
    ],
  },
  emissaoNotaFiscal: {
    documented: false,
    officialScope:
      'A API de Notas Fiscais v1 é apenas consulta (GET). Não há POST de emissão de NFe/NFS-e.',
    documentedInvoiceEndpoints: [
      'GET /v1/notas-fiscais',
      'GET /v1/notas-fiscais-servico',
      'GET /v1/notas-fiscais/{chave} (download XML/PDF)',
      'POST /v1/notas-fiscais/vinculo-mdfe (vínculo MDF-e, não emissão)',
    ],
    sources: [
      'https://developers.contaazul.com/open-api-docs/open-api-invoice',
      'https://developers.contaazul.com/aboutapis',
      'https://developers.contaazul.com/docs/sales-apis-openapi/v1/createvenda',
    ],
    testAccount: {
      createSale: 'POST /v1/venda → 201 (registro comercial; pendencia=PROCESSAMENTO_RESERVA_ESTOQUE; não gera NF)',
      postNotasFiscais: '405 Method Not Allowed',
      postNotasFiscaisEmitir: '405 Method Not Allowed',
      postNotasFiscaisServico: '404 recurso inexistente',
      postVendaEmitirPaths: '404 Not Found',
      postNfeNfse: '404 recurso inexistente',
    },
  },
} as const;

@Injectable()
export class ContaAzulIntegrationService {
  private readonly logger = new Logger(ContaAzulIntegrationService.name);
  private readonly pendingStates = new Map<
    string,
    { createdAt: number }
  >();
  private readonly syncJobs = new Map<string, CaSyncJobInternal>();
  private readonly vendasJobs = new Map<string, CaVendasJobInternal>();
  private readonly nfVinculoAuditJobs = new Map<
    string,
    CaNfVinculoAuditJobInternal
  >();
  private readonly xmlVendasJobs = new Map<string, CaXmlVendasJobInternal>();
  private readonly itensExternosXmlJobs = new Map<
    string,
    CaItensExternosXmlJobInternal
  >();
  private readonly sincronizacaoCompletaJobs = new Map<
    string,
    CaSincronizacaoCompletaJobInternal
  >();
  private refreshInFlight: Promise<StoredSession> | null = null;
  private refreshLockColumnAvailable = true;
  private notaArquivoSyncRunning = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly financeiro: FinanceiroService,
    private readonly externalItems: ExternalItemsService,
    @Optional() private readonly storage?: R2StorageService,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.clientId() && this.clientSecret() && this.redirectUri());
  }

  getAuthorizationUrl(): { url: string; state: string; redirectUri: string } {
    this.ensureConfigured();
    this.pruneStates();
    const state = newOauthState();
    this.pendingStates.set(state, { createdAt: Date.now() });
    const redirectUri = this.redirectUri();
    return {
      url: buildContaAzulAuthorizeUrl({
        clientId: this.clientId(),
        redirectUri,
        state,
      }),
      state,
      redirectUri,
    };
  }

  async connectWithTestUser(): Promise<{
    connected: true;
    expiresAt: string;
    categoriasSmokeTest: unknown;
    via: 'cognito_test_user';
  }> {
    this.ensureConfigured();
    const tokens = await this.cognitoUserPassword();
    await this.persistSession(tokens, null);
    const categorias = await this.getCategorias();
    return {
      connected: true,
      via: 'cognito_test_user',
      expiresAt: expiryFromExpiresIn(tokens.expires_in).toISOString(),
      categoriasSmokeTest: categorias,
    };
  }

  async connectWithCode(code: string, state?: string): Promise<{
    connected: true;
    expiresAt: string;
    categoriasSmokeTest: unknown;
  }> {
    this.ensureConfigured();
    const trimmed = code.trim();
    if (!trimmed) {
      throw new BadRequestException('code OAuth é obrigatório.');
    }
    if (state && !this.pendingStates.has(state)) {
      this.logger.warn('OAuth state ausente ou expirado — seguindo com o code.');
    }
    if (state) this.pendingStates.delete(state);

    const tokens = await this.exchangeCode(trimmed);
    await this.persistSession(tokens, null);
    const categorias = await this.getCategorias();
    return {
      connected: true,
      expiresAt: expiryFromExpiresIn(tokens.expires_in).toISOString(),
      categoriasSmokeTest: categorias,
    };
  }

  async status(): Promise<{
    configured: boolean;
    connected: boolean;
    expiresAt: string | null;
    expiresSoon: boolean;
    lastSyncAt: string | null;
    lastSyncError: string | null;
  }> {
    const session = await this.loadSession();
    const syncMeta = await this.loadSyncMeta();
    let connected = Boolean(session?.refreshToken || session?.accessToken);
    if (connected) {
      try {
        await this.getCategorias(1, 10);
      } catch {
        connected = false;
      }
    }
    return {
      configured: this.isConfigured(),
      connected,
      expiresAt: session?.expiresAt.toISOString() ?? null,
      expiresSoon: session
        ? isAccessTokenExpired(session.expiresAt)
        : true,
      lastSyncAt: syncMeta.lastSyncAt?.toISOString() ?? null,
      lastSyncError: syncMeta.lastSyncError,
    };
  }

  /**
   * Sincroniza NFs + contas a pagar/receber da conta conectada
   * (produção ou teste) e atualiza FinanceiroNF quando houver match.
   */
  startSyncJob(): CaSyncJobState {
    this.ensureConfigured();
    const running = [...this.syncJobs.values()].find(
      (job) => job.status === 'processando',
    );
    if (running) return this.toSyncJobPublic(running);

    const job: CaSyncJobInternal = {
      jobId: randomUUID(),
      status: 'processando',
      processedWindows: 0,
      totalWindows: 0,
      message: 'Sincronizando...',
      createdAt: new Date(),
    };
    this.syncJobs.set(job.jobId, job);
    void this.processSyncJob(job.jobId);
    return this.toSyncJobPublic(job);
  }

  getSyncJob(jobId: string): CaSyncJobState {
    const job = this.syncJobs.get(jobId);
    if (!job) {
      throw new NotFoundException(
        'Sincronização da Conta Azul não encontrada.',
      );
    }
    return this.toSyncJobPublic(job);
  }

  /**
   * P1: inicia dry-run/apply em background e devolve o job na hora
   * (a busca de NF por venda é longa demais para uma requisição síncrona).
   */
  startVendasJob(options: { apply: boolean }): CaVendasJobState {
    this.ensureConfigured();
    this.pruneVendasJobs();
    const running = [...this.vendasJobs.values()].find(
      (job) => job.status === 'processando' && job.apply === options.apply,
    );
    if (running) return this.toVendasJobPublic(running);

    const job: CaVendasJobInternal = {
      jobId: randomUUID(),
      status: 'processando',
      processed: 0,
      total: 0,
      apply: options.apply,
      message: 'Iniciando...',
      createdAt: new Date(),
    };
    this.vendasJobs.set(job.jobId, job);
    void this.processVendasJob(job.jobId);
    return this.toVendasJobPublic(job);
  }

  getVendasJob(jobId: string): CaVendasJobState {
    const job = this.vendasJobs.get(jobId);
    if (!job) {
      throw new NotFoundException(
        'Vinculação de vendas da Conta Azul não encontrada.',
      );
    }
    return this.toVendasJobPublic(job);
  }

  startNfVinculoAuditJob(): CaNfVinculoAuditJobState {
    this.ensureConfigured();
    this.pruneNfVinculoAuditJobs();
    const running = [...this.nfVinculoAuditJobs.values()].find(
      (job) => job.status === 'processando',
    );
    if (running) return this.toNfVinculoAuditJobPublic(running);
    const job: CaNfVinculoAuditJobInternal = {
      jobId: randomUUID(),
      status: 'processando',
      processed: 0,
      total: 0,
      message: 'Iniciando auditoria de vínculos NF (dry-run)...',
      createdAt: new Date(),
    };
    this.nfVinculoAuditJobs.set(job.jobId, job);
    void this.processNfVinculoAuditJob(job.jobId);
    return this.toNfVinculoAuditJobPublic(job);
  }

  getNfVinculoAuditJob(jobId: string): CaNfVinculoAuditJobState {
    const job = this.nfVinculoAuditJobs.get(jobId);
    if (!job) {
      throw new NotFoundException('Auditoria de vínculos NF não encontrada.');
    }
    return this.toNfVinculoAuditJobPublic(job);
  }

  /**
   * Consulta live na Conta Azul + pedidos do ERP para números WEG específicos.
   * Não grava nada.
   */
  async probeWegPedidos(numeros: string[]): Promise<Record<string, unknown>> {
    this.ensureConfigured();
    const wanted = [
      ...new Set(numeros.map((n) => String(n).trim()).filter(Boolean)),
    ];
    if (wanted.length === 0) {
      throw new BadRequestException('Informe ao menos um número de pedido.');
    }
    const erpAll = await this.loadAuditOrders();
    const erpExact = erpAll.filter((o) => {
      const ext = String(o.externalOrderNumber ?? '');
      return wanted.some((n) => ext === n || ext.startsWith(n));
    });
    const buscaAttempts: unknown[] = [];
    const vendasFound: CaVenda[] = [];
    const rawSamples: unknown[] = [];
    const tryBusca = async (
      variant: string,
      params: Record<string, string | number | boolean>,
    ) => {
      try {
        const payload = await this.apiGet('/v1/venda/busca', params);
        const itens = this.payloadItems(payload);
        buscaAttempts.push({
          variant,
          params,
          itemCount: itens.length,
          keys: objectKeys(payload),
        });
        for (const item of itens) {
          rawSamples.push({
            via: 'busca',
            variant,
            keys: objectKeys(item),
            numero: item.numero ?? null,
            numero_pedido: item.numero_pedido ?? null,
            codigo_pedido: item.codigo_pedido ?? null,
            pedido: item.pedido ?? null,
          });
          const mapped = mapContaAzulVenda(item);
          if (
            mapped &&
            !vendasFound.some((v) => v.contaAzulId === mapped.contaAzulId)
          ) {
            vendasFound.push(mapped);
          }
        }
      } catch (err) {
        buscaAttempts.push({
          variant,
          params,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };
    for (const numero of wanted) {
      const variants = [...new Set([numero, `${numero}1`, `${numero}11`])];
      for (const variant of variants) {
        const numeroParam = Number(variant);
        await tryBusca(variant, {
          pagina: 1,
          tamanho_pagina: 50,
          numero: Number.isFinite(numeroParam) ? numeroParam : variant,
        });
        await tryBusca(variant, {
          pagina: 1,
          tamanho_pagina: 50,
          numero_pedido: variant,
        });
        await tryBusca(variant, {
          pagina: 1,
          tamanho_pagina: 50,
          pesquisa: variant,
        });
      }
    }

    const vendaIds = [
      ...new Set(
        [
          ...erpExact.map((o) => o.contaAzulVendaId),
          ...vendasFound.map((v) => v.contaAzulId),
        ].filter((id): id is string => Boolean(id)),
      ),
    ];
    const vendaDetalhes: unknown[] = [];
    for (const id of vendaIds.slice(0, 12)) {
      try {
        const payload = (await this.apiGet(`/v1/venda/${id}`)) as Record<
          string,
          unknown
        >;
        const inner =
          payload.venda && typeof payload.venda === 'object'
            ? (payload.venda as Record<string, unknown>)
            : payload;
        const mapped = mapContaAzulVenda(inner);
        vendaDetalhes.push({
          id,
          keys: objectKeys(payload),
          innerKeys: objectKeys(inner),
          numero: inner.numero ?? payload.numero ?? null,
          numero_pedido: inner.numero_pedido ?? null,
          codigo_pedido: inner.codigo_pedido ?? null,
          pedido: inner.pedido ?? payload.pedido ?? null,
          mapped,
        });
        if (
          mapped &&
          !vendasFound.some((v) => v.contaAzulId === mapped.contaAzulId)
        ) {
          vendasFound.push(mapped);
        }
      } catch (err) {
        vendaDetalhes.push({
          id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const notas: unknown[] = [];
    const today = new Date();
    for (const venda of vendasFound.slice(0, 12)) {
      const around = venda.data ? new Date(venda.data) : today;
      const rows = await this.listNotasByVendaId(venda.contaAzulId, around);
      notas.push({
        vendaId: venda.contaAzulId,
        vendaNumero: venda.numero,
        vendaNumeroPedido: venda.numeroPedido,
        wegHint: vendaWegHint(venda),
        nfs: rows,
      });
    }
    for (const order of erpExact) {
      const seenNf = new Set<string>();
      for (const raw of [
        order.invoiceNumber,
        ...order.history.map((h) => h.invoiceNumber),
      ]) {
        const digits = invoiceNumberDigits(String(raw ?? ''));
        if (!digits || seenNf.has(digits)) continue;
        seenNf.add(digits);
        try {
          const payload = (await this.apiGet('/v1/notas-fiscais', {
            pagina: 1,
            tamanho_pagina: 50,
            numero_nota: Number(digits) || digits,
            data_inicial: this.ymd(new Date(today.getTime() - 14 * 86400000)),
            data_final: this.ymd(today),
          })) as Record<string, unknown>;
          notas.push({
            via: 'numero_nota',
            pedido: order.externalOrderNumber,
            nf: digits,
            keys: objectKeys(payload),
            itens: this.payloadItems(payload).slice(0, 5),
          });
        } catch (err) {
          notas.push({
            via: 'numero_nota',
            nf: digits,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    const audit = planNfVinculoAudit({
      orders: erpExact,
      vendas: vendasFound,
    });
    return {
      ok: true,
      numeros: wanted,
      erp: erpExact,
      buscaAttempts,
      rawSamples,
      vendaDetalhes,
      vendasFound,
      notas,
      matching: audit,
      message:
        'Probe live da Conta Azul + pedidos do banco conectado. Não aplica correção.',
    };
  }

  /**
   * Processa XML da NF-e de TODAS as vendas (Caso 1 completa pedido existente;
   * Caso 2 cria VENDA_EXTERNA). Dry-run por padrão; apply só grava após confirmação.
   */
  startXmlVendasJob(options: { apply: boolean }): CaXmlVendasJobState {
    this.ensureConfigured();
    this.pruneXmlVendasJobs();
    const running = [...this.xmlVendasJobs.values()].find(
      (job) => job.status === 'processando' && job.apply === options.apply,
    );
    if (running) return this.toXmlVendasJobPublic(running);

    const job: CaXmlVendasJobInternal = {
      jobId: randomUUID(),
      status: 'processando',
      processed: 0,
      total: 0,
      apply: options.apply,
      message: 'Iniciando...',
      createdAt: new Date(),
    };
    this.xmlVendasJobs.set(job.jobId, job);
    void this.processXmlVendasJob(job.jobId);
    return this.toXmlVendasJobPublic(job);
  }

  getXmlVendasJob(jobId: string): CaXmlVendasJobState {
    const job = this.xmlVendasJobs.get(jobId);
    if (!job) {
      throw new NotFoundException(
        'Processamento XML das vendas da Conta Azul não encontrado.',
      );
    }
    return this.toXmlVendasJobPublic(job);
  }

  /**
   * Corrige itens WEG divergentes do XML da NF revalidada via id_venda.
   * Dry-run por padrão; apply só grava após confirmação.
   * Pedido sem contaAzulVendaId é ignorado.
   */
  startItensExternosXmlJob(options: {
    apply: boolean;
    pedido?: string;
  }): CaItensExternosXmlJobState {
    this.pruneItensExternosXmlJobs();
    const pedido = options.pedido?.trim() || undefined;
    const running = [...this.itensExternosXmlJobs.values()].find(
      (job) =>
        job.status === 'processando' &&
        job.apply === options.apply &&
        (job.pedido ?? '') === (pedido ?? ''),
    );
    if (running) return this.toItensExternosXmlJobPublic(running);

    const job: CaItensExternosXmlJobInternal = {
      jobId: randomUUID(),
      status: 'processando',
      processed: 0,
      total: 0,
      apply: options.apply,
      message: 'Iniciando...',
      createdAt: new Date(),
      pedido,
    };
    this.itensExternosXmlJobs.set(job.jobId, job);
    void this.processItensExternosXmlJob(job.jobId);
    return this.toItensExternosXmlJobPublic(job);
  }

  getItensExternosXmlJob(jobId: string): CaItensExternosXmlJobState {
    const job = this.itensExternosXmlJobs.get(jobId);
    if (!job) {
      throw new NotFoundException(
        'Correção de itens externos via XML não encontrada.',
      );
    }
    return this.toItensExternosXmlJobPublic(job);
  }

  /**
   * Orquestra cadastros → correção de itens → XML vendas (Caso 2) →
   * notas antigas → formato de NF. Dry-run por padrão.
   */
  startSincronizacaoCompletaJob(options: {
    apply: boolean;
  }): CaSincronizacaoCompletaJobState {
    this.ensureConfigured();
    this.pruneSincronizacaoCompletaJobs();
    const running = [...this.sincronizacaoCompletaJobs.values()].find(
      (job) => job.status === 'processando' && job.apply === options.apply,
    );
    if (running) return this.toSincronizacaoCompletaJobPublic(running);

    const job: CaSincronizacaoCompletaJobInternal = {
      jobId: randomUUID(),
      status: 'processando',
      processed: 0,
      total: 5,
      apply: options.apply,
      message: 'Iniciando sincronização completa...',
      createdAt: new Date(),
    };
    this.sincronizacaoCompletaJobs.set(job.jobId, job);
    void this.processSincronizacaoCompletaJob(job.jobId);
    return this.toSincronizacaoCompletaJobPublic(job);
  }

  getSincronizacaoCompletaJob(jobId: string): CaSincronizacaoCompletaJobState {
    const job = this.sincronizacaoCompletaJobs.get(jobId);
    if (!job) {
      throw new NotFoundException(
        'Sincronização completa da Conta Azul não encontrada.',
      );
    }
    return this.toSincronizacaoCompletaJobPublic(job);
  }

  /**
   * P0: pessoas + catálogos + cadastros reais Customer/Supplier/Carrier.
   * Dry-run só reporta. Apply grava espelhos e cria/atualiza o ERP.
   */
  async sincronizarCadastros(options: {
    apply: boolean;
    previewLimit?: number;
  }): Promise<{
    ok: true;
    apply: boolean;
    applied: boolean;
    pessoas: {
      mapeadas: number;
      comEndereco: number;
      detalhesBuscados: number;
    };
    cadastrosErp: {
      customers: number;
      suppliers: number;
      carriers: number;
    };
    divergencias: {
      nome: number;
      endereco: number;
      soNaContaAzul: number;
      soNoErp: number;
      preview: PessoaDivergence[];
    };
    erpApply: {
      criar: { customers: number; suppliers: number; carriers: number };
      atualizar: { customers: number; suppliers: number; carriers: number };
      pedidosVinculados: number;
      previewPedidos: Array<{
        code: string;
        externalOrderNumber: string | null;
        cnpj: string;
      }>;
    };
    catalogos: { categorias: number; centrosCusto: number };
    titulosAmostra: {
      total: number;
      comCategoria: number;
      comCentroCusto: number;
    };
    appliedCounts?: {
      pessoasGravadas: number;
      categoriasGravadas: number;
      centrosGravados: number;
      customersCreated: number;
      customersUpdated: number;
      suppliersCreated: number;
      suppliersUpdated: number;
      carriersCreated: number;
      carriersUpdated: number;
      pedidosVinculados: number;
    };
    message: string;
  }> {
    this.ensureConfigured();
    const previewLimit = Math.max(1, Math.min(50, options.previewLimit ?? 20));
    const [customers, suppliers, carriers, orders] = await Promise.all([
      this.prisma.client.customer.findMany({
        select: { id: true, name: true, document: true, deliveryAddress: true },
      }),
      this.prisma.client.supplier.findMany({
        select: { id: true, name: true, document: true },
      }),
      this.prisma.client.carrier.findMany({
        select: {
          id: true,
          name: true,
          document: true,
          deliveryAddress: true,
          documents: { select: { document: true } },
        },
      }),
      this.prisma.client.order.findMany({
        select: {
          id: true,
          code: true,
          externalOrderNumber: true,
          customerId: true,
          customerName: true,
          receiverName: true,
          customerDocument: true,
          deliveryCnpj: true,
          deliveryAddress: true,
        },
      }),
    ]);

    const parties: ErpPartyInput[] = [
      ...customers.map((row) => ({
        kind: 'CUSTOMER' as const,
        id: row.id,
        name: row.name,
        document: row.document,
        deliveryAddress: row.deliveryAddress,
      })),
      ...suppliers.map((row) => ({
        kind: 'SUPPLIER' as const,
        id: row.id,
        name: row.name,
        document: row.document,
      })),
      ...carriers.map((row) => ({
        kind: 'CARRIER' as const,
        id: row.id,
        name: row.name,
        document: row.document,
        extraDocuments: row.documents.map((d) => d.document),
        deliveryAddress: row.deliveryAddress,
      })),
    ];

    const neededDigits = new Set<string>();
    for (const party of parties) {
      const d = documentDigits(party.document);
      if (d.length >= 11) neededDigits.add(d);
      for (const extra of party.extraDocuments ?? []) {
        const x = documentDigits(extra);
        if (x.length >= 11) neededDigits.add(x);
      }
    }
    for (const order of orders) {
      const d = documentDigits(order.deliveryCnpj);
      if (d.length >= 11) neededDigits.add(d);
    }

    const listed = await this.listAllPessoas();
    const { pessoas, detalhesBuscados } = await this.enrichPessoasAddresses(
      listed,
      neededDigits,
    );
    const plan = planPessoasDivergencias({ pessoas, parties });
    const erpPlan = planErpCadastroApply({ pessoas, parties, orders });
    let categorias: CaCatalogoItem[] = [];
    let centros: CaCatalogoItem[] = [];
    try {
      categorias = await this.listCatalogo('/v1/categorias', mapContaAzulCategoria, {
        permite_apenas_filhos: false,
      });
    } catch (err) {
      this.logger.warn(
        `GET /v1/categorias: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    try {
      centros = await this.listCatalogo(
        '/v1/centro-de-custo',
        mapContaAzulCentroCusto,
        { filtro_rapido: 'TODOS' },
      );
    } catch (err) {
      this.logger.warn(
        `GET /v1/centro-de-custo: ${err instanceof Error ? err.message : String(err)}`,
      );
      try {
        centros = await this.listCatalogo(
          '/v1/centro-de-custo',
          mapContaAzulCentroCusto,
        );
      } catch (err2) {
        this.logger.warn(
          `GET /v1/centro-de-custo retry: ${err2 instanceof Error ? err2.message : String(err2)}`,
        );
      }
    }

    const today = new Date();
    const amostraTitulos = await this.listFinanceiroTitulos(
      '/v1/financeiro/eventos-financeiros/contas-a-receber/buscar',
      this.ymd(this.addUtcDays(today, -62)),
      this.ymd(today),
      'receber',
    );
    const amostraPagar = await this.listFinanceiroTitulos(
      '/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar',
      this.ymd(this.addUtcDays(today, -62)),
      this.ymd(today),
      'pagar',
    );
    const titulosAmostra = [...amostraTitulos, ...amostraPagar];

    const byTipo = (tipo: PessoaDivergence['tipo']) =>
      plan.divergencias.filter((d) => d.tipo === tipo);
    const preview = [
      ...byTipo('nome'),
      ...byTipo('endereco'),
      ...byTipo('so_conta_azul'),
      ...byTipo('so_erp'),
    ].slice(0, previewLimit);
    const countMut = (
      action: ErpCadastroMutation['action'],
      kind: ErpCadastroMutation['kind'],
    ) =>
      erpPlan.mutations.filter((m) => m.action === action && m.kind === kind)
        .length;

    const report = {
      ok: true as const,
      pessoas: {
        mapeadas: pessoas.length,
        comEndereco: pessoas.filter((p) => Boolean(p.endereco)).length,
        detalhesBuscados,
      },
      cadastrosErp: {
        customers: customers.length,
        suppliers: suppliers.length,
        carriers: carriers.length,
      },
      divergencias: {
        nome: byTipo('nome').length,
        endereco: byTipo('endereco').length,
        soNaContaAzul: byTipo('so_conta_azul').length,
        soNoErp: byTipo('so_erp').length,
        preview,
      },
      erpApply: {
        criar: {
          customers: countMut('create', 'CUSTOMER'),
          suppliers: countMut('create', 'SUPPLIER'),
          carriers: countMut('create', 'CARRIER'),
        },
        atualizar: {
          customers: countMut('update', 'CUSTOMER'),
          suppliers: countMut('update', 'SUPPLIER'),
          carriers: countMut('update', 'CARRIER'),
        },
        pedidosVinculados: erpPlan.pedidos.length,
        previewPedidos: erpPlan.pedidos.slice(0, previewLimit).map((row) => ({
          code: row.code,
          externalOrderNumber: row.externalOrderNumber,
          cnpj: row.cnpj,
        })),
      },
      catalogos: {
        categorias: categorias.length,
        centrosCusto: centros.length,
      },
      titulosAmostra: {
        total: titulosAmostra.length,
        comCategoria: titulosAmostra.filter((t) => Boolean(t.categoria)).length,
        comCentroCusto: titulosAmostra.filter((t) => Boolean(t.centroCusto)).length,
      },
    };

    if (!options.apply) {
      return {
        ...report,
        apply: false,
        applied: false,
        message:
          'Dry-run P0: nenhum cadastro do ERP foi alterado. apply=true cria/atualiza Customer, Supplier e Carrier e vincula pedidos pelo CNPJ de entrega.',
      };
    }

    const pessoasGravadas = await this.replacePessoas(pessoas);
    const categoriasGravadas = await this.replaceCatalogo(
      'ContaAzulCategoria',
      categorias,
    );
    const centrosGravados = await this.replaceCatalogo(
      'ContaAzulCentroCusto',
      centros,
    );
    const appliedErp = await this.applyErpCadastros(
      erpPlan.mutations,
      erpPlan.pedidos,
      pessoas,
    );
    this.logger.log(
      `Conta Azul P0 apply: ${pessoasGravadas} pessoas, ${appliedErp.customersCreated} clientes novos, ${appliedErp.customersUpdated} atualizados, ${appliedErp.pedidosVinculados} pedidos vinculados.`,
    );
    return {
      ...report,
      apply: true,
      applied: true,
      appliedCounts: {
        pessoasGravadas,
        categoriasGravadas,
        centrosGravados,
        ...appliedErp,
      },
      message: `Aplicado P0: ${appliedErp.customersCreated + appliedErp.suppliersCreated + appliedErp.carriersCreated} cadastro(s) criado(s), ${appliedErp.customersUpdated + appliedErp.suppliersUpdated + appliedErp.carriersUpdated} atualizado(s), ${appliedErp.pedidosVinculados} pedido(s) vinculado(s).`,
    };
  }


  /**
   * Preenche Order.customerName e Order.deliveryAddress a partir da CA
   * para CNPJs que não estão no cadastro Customer do ERP.
   * Não altera receiverName nem deliveryCnpj.
   */
  async preencherPedidosCadastro(options: {
    apply: boolean;
    previewLimit?: number;
  }): Promise<{
    ok: true;
    apply: boolean;
    applied: boolean;
    pedidosElegiveis: number;
    cnpjsBuscados: number;
    encontradosNaCa: number;
    semMatch: number;
    semDadosCompletos: number;
    aAtualizar: number;
    detalhesBuscados: number;
    preview: PedidoCadastroPreview[];
    appliedCounts?: { pedidosAtualizados: number };
    message: string;
  }> {
    this.ensureConfigured();
    const previewLimit = Math.max(1, Math.min(50, options.previewLimit ?? 20));
    const [orders, customers] = await Promise.all([
      this.prisma.client.order.findMany({
        select: {
          id: true,
          code: true,
          externalOrderNumber: true,
          customerId: true,
          customerName: true,
          receiverName: true,
          customerDocument: true,
          deliveryCnpj: true,
          deliveryAddress: true,
        },
      }),
      this.prisma.client.customer.findMany({
        select: { document: true },
      }),
    ]);

    const registeredDigits = new Set<string>();
    for (const row of customers) {
      const digits = documentDigits(row.document);
      if (digits.length >= 11) registeredDigits.add(digits);
    }

    const eligible: CadastroSyncOrderInput[] = [];
    for (const row of orders) {
      const digits = documentDigits(row.deliveryCnpj);
      if (digits.length < 11 || registeredDigits.has(digits)) continue;
      if (!orderNeedsPedidoCadastroFill(row)) continue;
      eligible.push(row);
    }

    const uniqueDigits = [
      ...new Set(eligible.map((row) => documentDigits(row.deliveryCnpj))),
    ];
    const pessoasByDocumento = new Map<string, CaPessoa>();
    let detalhesBuscados = 0;
    let listedPessoas: CaPessoa[] | null = null;
    for (const digits of uniqueDigits) {
      const found = await this.findPessoaByDocumento(digits, async () => {
        listedPessoas ??= await this.listAllPessoas();
        return listedPessoas;
      });
      detalhesBuscados += found.detalheBuscado ? 1 : 0;
      if (found.pessoa) pessoasByDocumento.set(digits, found.pessoa);
    }

    const pedidos = planPreencherPedidosCadastro({
      pessoasByDocumento,
      orders: eligible,
    });
    let semMatch = 0;
    let semDadosCompletos = 0;
    for (const row of eligible) {
      const digits = documentDigits(row.deliveryCnpj);
      const pessoa = pessoasByDocumento.get(digits);
      if (!pessoa) {
        semMatch += 1;
        continue;
      }
      if (!pessoa.endereco || !pessoa.enderecoJson) semDadosCompletos += 1;
    }

    const preview = [
      ...pedidos.filter((row) => Boolean(row.name)),
      ...pedidos.filter((row) => !row.name),
    ].slice(0, previewLimit);
    const report = {
      ok: true as const,
      pedidosElegiveis: eligible.length,
      cnpjsBuscados: uniqueDigits.length,
      encontradosNaCa: pessoasByDocumento.size,
      semMatch,
      semDadosCompletos,
      aAtualizar: pedidos.length,
      detalhesBuscados,
      preview,
    };

    if (!options.apply) {
      return {
        ...report,
        apply: false,
        applied: false,
        message:
          'Dry-run: nenhum pedido foi alterado. apply=true preenche comprador e endereço só nos pedidos listados (Recebedor permanece igual).',
      };
    }

    let pedidosAtualizados = 0;
    for (const row of pedidos) {
      const pessoa = pessoasByDocumento.get(row.cnpj);
      if (!pessoa) continue;
      const data: { customerName?: string; deliveryAddress?: string } = {};
      if (row.name) data.customerName = pessoa.nome;
      if (row.address && pessoa.enderecoJson) {
        data.deliveryAddress = pessoa.enderecoJson;
      }
      if (!data.customerName && !data.deliveryAddress) continue;
      await this.prisma.client.order.update({
        where: { id: row.orderId },
        data,
      });
      pedidosAtualizados += 1;
    }
    this.logger.log(
      `Conta Azul preencher pedidos: ${pedidosAtualizados} atualizados.`,
    );
    return {
      ...report,
      apply: true,
      applied: true,
      appliedCounts: { pedidosAtualizados },
      message: `Aplicado: ${pedidosAtualizados} pedido(s) atualizado(s). Recebedor e CNPJ de entrega não foram alterados.`,
    };
  }

  /**
   * P1: GET /v1/venda/busca cruzado com pedidos do ERP.
   * Apply preenche Order.contaAzulVendaId e, se a venda já tiver NF-e, invoiceNumber.
   */
  async sincronizarVendas(options: {
    apply: boolean;
    previewLimit?: number;
    onProgress?: (update: {
      processed?: number;
      total?: number;
      message: string;
    }) => void;
  }): Promise<CaVendasReport> {
    this.ensureConfigured();
    const previewLimit = Math.max(1, Math.min(50, options.previewLimit ?? 20));
    const reportProgress = (update: {
      processed?: number;
      total?: number;
      message: string;
    }) => options.onProgress?.(update);
    reportProgress({ message: 'Buscando pedidos e pessoas...' });
    const [orderRows, pessoas] = await Promise.all([
      this.prisma.client.order.findMany({
        select: {
          id: true,
          code: true,
          externalOrderNumber: true,
          customerDocument: true,
          deliveryCnpj: true,
          total: true,
          totalValue: true,
          status: true,
          invoiceNumber: true,
          notaRemessa: true,
          orderDate: true,
          createdAt: true,
        },
      }),
      this.listAllPessoas(),
    ]);
    const linkedRows = await this.prisma.client.$queryRaw<
      Array<{ id: string; contaAzulVendaId: string | null }>
    >`SELECT id::text AS id, "contaAzulVendaId" FROM "Order"`;
    const linkedById = new Map(
      linkedRows.map((row) => [row.id, row.contaAzulVendaId]),
    );
    const orders = orderRows.map((o) => ({
      ...o,
      contaAzulVendaId: linkedById.get(o.id) ?? null,
    }));
    const pessoaById = new Map(pessoas.map((p) => [p.contaAzulId, p]));
    const today = new Date();
    const dataFinal = this.ymd(today);
    reportProgress({ message: 'Buscando vendas na Conta Azul...' });
    const dataInicial = await this.findHistoryStart(today);
    const vendasRaw = await this.listAllVendas(dataInicial, dataFinal);
    const vendas: CaVenda[] = vendasRaw.map((v) => {
      if (v.clienteDocumento || !v.clienteId) return v;
      const pessoa = pessoaById.get(v.clienteId);
      return pessoa
        ? { ...v, clienteDocumento: pessoa.documento }
        : v;
    });

    const plan = planVendaVinculos({
      vendas,
      orders: orders.map((o) => ({
        id: o.id,
        code: o.code,
        externalOrderNumber: o.externalOrderNumber,
        customerDocument: o.customerDocument,
        deliveryCnpj: o.deliveryCnpj,
        total: Number(o.totalValue ?? o.total) || 0,
        status: String(o.status),
        contaAzulVendaId: o.contaAzulVendaId,
      })),
    });

    const vendaByOrder = new Map(
      orders.map((o) => [o.id, o.contaAzulVendaId] as const),
    );
    for (const row of plan.claros) {
      const current = vendaByOrder.get(row.orderId);
      if (current) continue;
      vendaByOrder.set(row.orderId, row.vendaId);
    }
    const invoiceOrders = orders.map((o) => ({
      id: o.id,
      code: o.code,
      externalOrderNumber: o.externalOrderNumber,
      invoiceNumber: o.invoiceNumber,
      notaRemessa: o.notaRemessa,
      contaAzulVendaId: vendaByOrder.get(o.id) ?? null,
      around: o.orderDate ?? o.createdAt,
    }));
    const recemVinculados = new Set(plan.claros.map((row) => row.orderId));
    const invoiceFillOrders = invoiceOrders.filter((o) => {
      if (!o.contaAzulVendaId) return false;
      if (recemVinculados.has(o.id)) return true;
      const current = String(o.invoiceNumber ?? '').trim();
      return !current || invoiceNumberMatchesRemessa(current, o.notaRemessa);
    });
    const vendasAVerificar = this.countUniqueVendaIds(invoiceFillOrders);
    reportProgress({
      processed: 0,
      total: vendasAVerificar,
      message: this.vendasProgressMessage(0, vendasAVerificar),
    });
    const notas = await this.collectNotasForInvoiceFill(
      invoiceFillOrders,
      (processed, total) => {
        reportProgress({
          processed,
          total,
          message: this.vendasProgressMessage(processed, total),
        });
      },
    );
    const invoicePlan = planInvoiceFromLinkedVendas({
      orders: invoiceOrders,
      notas,
    });

    const porRazao: Record<string, number> = {};
    for (const row of plan.claros) {
      porRazao[row.reason] = (porRazao[row.reason] ?? 0) + 1;
    }

    const jaVinculados = orders.filter((o) => Boolean(o.contaAzulVendaId)).length;
    const report = {
      ok: true as const,
      vendas: vendas.length,
      pedidos: orders.length,
      vinculados: plan.claros.length,
      semCorrespondencia: plan.semCorrespondencia.length,
      jaVinculados,
      nfsAPreencher: invoicePlan.preencher.length,
      nfsDivergentes: invoicePlan.divergencias.length,
      porRazao,
      previewClaros: plan.claros.slice(0, previewLimit),
      previewSemMatch: plan.semCorrespondencia.slice(0, previewLimit),
      previewNfFill: invoicePlan.preencher.slice(0, previewLimit),
      previewNfDivergencias: invoicePlan.divergencias.slice(0, previewLimit),
    };

    if (!options.apply) {
      return {
        ...report,
        apply: false,
        applied: false,
        message:
          'Dry-run P1: nenhum pedido foi alterado. apply=true grava contaAzulVendaId nos matches claros e invoiceNumber quando a venda já tem NF-e.',
      };
    }

    reportProgress({ message: 'Gravando vínculos...' });
    let pedidosVinculados = 0;
    for (const row of plan.claros) {
      await this.prisma.client.$executeRaw`
        UPDATE "Order"
        SET "contaAzulVendaId" = ${row.vendaId}, "updatedAt" = NOW()
        WHERE id = CAST(${row.orderId} AS UUID)
          AND ("contaAzulVendaId" IS NULL OR "contaAzulVendaId" = ${row.vendaId})
      `;
      pedidosVinculados += 1;
    }
    const invoicesPreenchidas = await this.applyInvoiceFills(invoicePlan.preencher);
    return {
      ...report,
      apply: true,
      applied: true,
      appliedCounts: { pedidosVinculados, invoicesPreenchidas },
      message: `Aplicado P1: ${pedidosVinculados} pedido(s) vinculados; ${invoicesPreenchidas} Nota(s) de Venda preenchida(s).`,
    };
  }

  /**
   * Pedidos já vinculados à venda: preenche invoiceNumber se a NF-e existir
   * na Conta Azul e o campo ainda estiver vazio (não sobrescreve venda real).
   */
  async syncLinkedVendaInvoices(options: {
    apply: boolean;
    daysBack?: number;
  }): Promise<{
    scanned: number;
    toFill: number;
    filled: number;
    divergencias: number;
    previewNfFill: InvoiceFillPreview[];
    previewNfDivergencias: InvoiceFillDivergencia[];
  }> {
    this.ensureConfigured();
    const linkedRows = await this.prisma.client.$queryRaw<
      Array<{
        id: string;
        code: string;
        externalOrderNumber: string | null;
        invoiceNumber: string | null;
        notaRemessa: string | null;
        contaAzulVendaId: string | null;
        orderDate: Date | null;
        createdAt: Date;
      }>
    >`
      SELECT
        id::text AS id,
        code,
        "externalOrderNumber",
        "invoiceNumber",
        "notaRemessa",
        "contaAzulVendaId",
        "orderDate",
        "createdAt"
      FROM "Order"
      WHERE "contaAzulVendaId" IS NOT NULL AND btrim("contaAzulVendaId") <> ''
    `;
    const pending = linkedRows.filter((row) => {
      const current = String(row.invoiceNumber ?? '').trim();
      return (
        !current || invoiceNumberMatchesRemessa(current, row.notaRemessa)
      );
    });
    if (pending.length === 0) {
      return {
        scanned: linkedRows.length,
        toFill: 0,
        filled: 0,
        divergencias: 0,
        previewNfFill: [],
        previewNfDivergencias: [],
      };
    }
    const notas = await this.collectNotasForInvoiceFill(
      pending.map((row) => ({
        ...row,
        around: row.orderDate ?? row.createdAt,
      })),
    );
    const invoicePlan = planInvoiceFromLinkedVendas({
      orders: linkedRows,
      notas,
    });
    if (!options.apply) {
      return {
        scanned: linkedRows.length,
        toFill: invoicePlan.preencher.length,
        filled: 0,
        divergencias: invoicePlan.divergencias.length,
        previewNfFill: invoicePlan.preencher.slice(0, 20),
        previewNfDivergencias: invoicePlan.divergencias.slice(0, 20),
      };
    }
    const filled = await this.applyInvoiceFills(invoicePlan.preencher);
    return {
      scanned: linkedRows.length,
      toFill: invoicePlan.preencher.length,
      filled,
      divergencias: invoicePlan.divergencias.length,
      previewNfFill: invoicePlan.preencher.slice(0, 20),
      previewNfDivergencias: invoicePlan.divergencias.slice(0, 20),
    };
  }

  /**
   * Todas as vendas CA × XML da NF-e.
   * Caso 1: completa OrderItem do pedido já vinculado (nunca duplica).
   * Caso 2: cria VENDA_EXTERNA FINALIZADO sem mexer em estoque.
   */
  async processarVendasXml(options: {
    apply: boolean;
    previewLimit?: number;
    onProgress?: (update: {
      processed?: number;
      total?: number;
      message: string;
    }) => void;
  }): Promise<CaXmlVendasReport> {
    this.ensureConfigured();
    const previewLimit = Math.max(1, Math.min(50, options.previewLimit ?? 15));
    const reportProgress = (update: {
      processed?: number;
      total?: number;
      message: string;
    }) => options.onProgress?.(update);

    reportProgress({ message: 'Carregando pedidos, produtos e cadastros...' });
    const [orderRows, linkedRows, products, customers, companies, externalItems] =
      await Promise.all([
        this.prisma.client.order.findMany({
          select: {
            id: true,
            code: true,
            source: true,
            externalOrderNumber: true,
            customerName: true,
            customerDocument: true,
            deliveryCnpj: true,
            invoiceNumber: true,
            notaRemessa: true,
            status: true,
            total: true,
            totalValue: true,
            orderDate: true,
            createdAt: true,
            items: {
              select: {
                id: true,
                lineNumber: true,
                sku: true,
                supplierMaterialCode: true,
                description: true,
                quantity: true,
                unit: true,
                ncm: true,
                unitPrice: true,
                totalPrice: true,
                productId: true,
                product: { select: { name: true } },
              },
            },
          },
        }),
        this.prisma.client.$queryRaw<
          Array<{ id: string; contaAzulVendaId: string | null }>
        >`SELECT id::text AS id, "contaAzulVendaId" FROM "Order"`,
        this.prisma.client.product.findMany({
          select: {
            id: true,
            sku: true,
            internalCode: true,
            supplierSku: true,
          },
        }),
        this.prisma.client.customer.findMany({
          select: { id: true, document: true },
        }),
        this.prisma.client.companyEntity.findMany({
          select: { id: true, cnpj: true },
        }),
        this.prisma.client.externalItem.findMany({
          select: { id: true, name: true },
        }),
      ]);
    const linkedById = new Map(
      linkedRows.map((row) => [row.id, row.contaAzulVendaId]),
    );
    const orders: ErpOrderForXml[] = orderRows.map((o) => ({
      id: o.id,
      code: o.code,
      source: String(o.source),
      externalOrderNumber: o.externalOrderNumber,
      customerName: o.customerName,
      customerDocument: o.customerDocument,
      deliveryCnpj: o.deliveryCnpj,
      invoiceNumber: o.invoiceNumber,
      notaRemessa: o.notaRemessa,
      status: String(o.status),
      total: Number(o.totalValue ?? o.total) || 0,
      contaAzulVendaId: linkedById.get(o.id) ?? null,
      items: o.items.map((it) => ({
        id: it.id,
        lineNumber: it.lineNumber,
        sku: it.sku,
        supplierMaterialCode: it.supplierMaterialCode,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        ncm: it.ncm,
        unitPrice: Number(it.unitPrice) || 0,
        totalPrice: Number(it.totalPrice) || 0,
        productId: it.productId,
        productName: it.product?.name ?? null,
      })),
    }));
    const aroundByOrder = new Map(
      orderRows.map((o) => [o.id, o.orderDate ?? o.createdAt] as const),
    );
    const productsBySku = buildProductSkuMap(products);
    const customerByDoc = new Map<string, string>();
    for (const c of customers) {
      const digits = documentDigits(c.document);
      if (digits.length >= 11 && !customerByDoc.has(digits)) {
        customerByDoc.set(digits, c.id);
      }
    }
    const companyByCnpj = new Map<string, string>();
    for (const c of companies) {
      const digits = documentDigits(c.cnpj);
      if (digits.length >= 11 && !companyByCnpj.has(digits)) {
        companyByCnpj.set(digits, c.id);
      }
    }

    reportProgress({ message: 'Buscando vendas na Conta Azul...' });
    const today = new Date();
    const dataFinal = this.ymd(today);
    const earliestOrder = orderRows.reduce<Date | null>((min, o) => {
      const d = o.orderDate ?? o.createdAt;
      if (!d) return min;
      return !min || d < min ? d : min;
    }, null);
    const dataInicial = this.ymd(
      this.addUtcDays(earliestOrder ?? this.addUtcDays(today, -540), -60),
    );
    const vendas = await this.listAllVendas(dataInicial, dataFinal);
    const classified = classifyXmlVendas({ vendas, orders });
    const caso1Inicial = classified.filter((r) => r.caso === 'caso1').length;
    const caso2Inicial = classified.filter((r) => r.caso === 'caso2').length;
    reportProgress({
      processed: 0,
      total: classified.length,
      message: `Classificado: ${caso1Inicial} Caso 1 (pedido existente), ${caso2Inicial} Caso 2 (venda avulsa). Indexando chaves das NF-e...`,
    });
    const chaveByNumero = await this.indexNfeChaves(
      dataInicial,
      dataFinal,
      (msg) => reportProgress({ message: msg }),
    );

    const takenExternal = new Set(
      orders
        .map((o) => String(o.externalOrderNumber ?? '').trim().toLowerCase())
        .filter(Boolean),
    );
    const caso1: Caso1Plan[] = [];
    const caso2: Caso2Plan[] = [];
    const ambiguos: XmlVendaSkip[] = [];
    const semXml: XmlVendaSkip[] = [];
    const duplicatas: XmlVendaSkip[] = [];
    const xmlByOrderInvoice = new Map<string, { dados: NfeXmlDados; raw: string }>();

    await mapLimit(
      classified,
      XML_DOWNLOAD_CONCURRENCY,
      async (row) => {
        if (row.caso === 'ambiguo') {
          ambiguos.push({
            vendaId: row.venda.contaAzulId,
            vendaNumero: row.venda.numero,
            clienteNome: row.venda.clienteNome,
            motivo: row.motivo ?? 'Match ambíguo — não cria pedido',
          });
          return;
        }
        if (
          row.caso === 'caso2' &&
          /cancel/i.test(String(row.venda.situacao ?? ''))
        ) {
          semXml.push({
            vendaId: row.venda.contaAzulId,
            vendaNumero: row.venda.numero,
            clienteNome: row.venda.clienteNome,
            motivo: `Venda cancelada (${row.venda.situacao})`,
          });
          return;
        }

        const around =
          (row.order ? aroundByOrder.get(row.order.id) : null) ??
          (row.venda.data ? new Date(row.venda.data) : today);
        const invoiceHint = this.realInvoiceNumber(row.order);
        const loaded = await this.loadNfeXmlDados({
          vendaId: row.venda.contaAzulId,
          orderId: row.order?.id ?? null,
          invoiceNumber: invoiceHint,
          around: Number.isFinite(around.getTime()) ? around : today,
          cache: xmlByOrderInvoice,
          chaveByNumero,
        });
        if ('error' in loaded) {
          semXml.push({
            vendaId: row.venda.contaAzulId,
            vendaNumero: row.venda.numero,
            clienteNome: row.venda.clienteNome,
            motivo: loaded.error,
          });
          return;
        }

        let current = row;
        if (current.caso === 'caso2') {
          const xPed =
            loaded.dados.items.map((it) => it.xPed).find((v) => Boolean(v)) ??
            null;
          const next = reclassifyByInvoice({
            row: current,
            invoiceNumber: loaded.dados.invoiceNumber,
            orders,
            xPed,
          });
          if (next.caso === 'ambiguo') {
            duplicatas.push({
              vendaId: current.venda.contaAzulId,
              vendaNumero: current.venda.numero,
              clienteNome: current.venda.clienteNome,
              motivo: next.motivo ?? 'NF já existe em mais de um pedido',
            });
            return;
          }
          if (next.caso === 'caso1' && next.order) {
            duplicatas.push({
              vendaId: current.venda.contaAzulId,
              vendaNumero: current.venda.numero,
              clienteNome: current.venda.clienteNome,
              motivo:
                next.motivo ??
                `NF ${loaded.dados.invoiceNumber} já no ERP — completa o pedido existente`,
            });
            current = next;
          }
        }

        if (current.caso === 'caso1' && current.order) {
          caso1.push(
            planCaso1Completar({
              venda: current.venda,
              order: current.order,
              xml: loaded.dados,
              via: current.via,
              productsBySku,
              externalItems,
            }),
          );
          return;
        }

        if (!loaded.dados.items.length) {
          semXml.push({
            vendaId: current.venda.contaAzulId,
            vendaNumero: current.venda.numero,
            clienteNome: current.venda.clienteNome,
            motivo: 'XML sem itens de produto',
          });
          return;
        }
        const destDoc = loaded.dados.destDocumento || documentDigits(current.venda.clienteDocumento);
        caso2.push(
          planCaso2Criar({
            venda: current.venda,
            xml: loaded.dados,
            takenExternal,
            customerId: destDoc ? customerByDoc.get(destDoc) ?? null : null,
            companyEntityId: loaded.dados.emitCnpj
              ? companyByCnpj.get(loaded.dados.emitCnpj) ?? null
              : null,
            productsBySku,
          }),
        );
      },
      (done, total) => {
        reportProgress({
          processed: done,
          total,
          message: `XML ${done} de ${total} vendas (Caso 1: ${caso1.length}, Caso 2: ${caso2.length})`,
        });
      },
    );

    const caso1Completar = caso1.filter((p) => !p.perfeito);
    const report: CaXmlVendasReport = {
      ok: true,
      apply: options.apply,
      applied: false,
      vendas: vendas.length,
      caso1: caso1.length,
      caso1Perfeitos: caso1.filter((p) => p.perfeito).length,
      caso1Completar: caso1Completar.length,
      caso1ItensPreenchidos: caso1.reduce((n, p) => n + p.fills.length, 0),
      caso1ItensAdicionados: caso1.reduce((n, p) => n + p.adds.length, 0),
      caso1ItensCorrigidos: caso1.reduce((n, p) => n + p.replaces.length, 0),
      caso2: caso2.length,
      caso2Itens: caso2.reduce((n, p) => n + p.items.length, 0),
      ambiguos: ambiguos.length,
      semXml: semXml.length,
      duplicataEvitada: duplicatas.length,
      previewCaso1: caso1Completar.slice(0, previewLimit),
      previewCaso2: caso2.slice(0, previewLimit),
      previewAmbiguos: ambiguos.slice(0, previewLimit),
      previewSemXml: semXml.slice(0, previewLimit),
      previewDuplicatas: duplicatas.slice(0, previewLimit),
      message: '',
    };
    report.message = options.apply
      ? ''
      : `Dry-run XML: ${report.caso1} Caso 1 (${report.caso1Perfeitos} já ok, ${report.caso1Completar} a completar, ${report.caso1ItensPreenchidos} item(ns) a preencher, ${report.caso1ItensAdicionados} item(ns) a adicionar, ${report.caso1ItensCorrigidos} item(ns) WEG a corrigir para Item Externo). ${report.caso2} Caso 2 (pedidos VENDA_EXTERNA novos). ${report.duplicataEvitada} duplicata(s) evitada(s). Nada gravado.`;

    if (!options.apply) return report;

    reportProgress({ message: 'Gravando compleções e pedidos novos...' });
    const appliedCounts = await this.applyVendasXmlPlans({
      caso1: caso1Completar,
      caso2,
    });
    return {
      ...report,
      applied: true,
      appliedCounts,
      message: `Aplicado XML: ${appliedCounts.pedidosCompletados} pedido(s) completados (${appliedCounts.itensPreenchidos} itens preenchidos, ${appliedCounts.itensAdicionados} adicionados, ${appliedCounts.itensCorrigidos} corrigidos para Item Externo); ${appliedCounts.pedidosCriados} VENDA_EXTERNA criada(s). Estoque não alterado.`,
    };
  }

  private realInvoiceNumber(order?: ErpOrderForXml | null): string | null {
    if (!order) return null;
    const current = String(order.invoiceNumber ?? '').trim();
    if (!current || !invoiceNumberDigits(current)) return null;
    if (invoiceNumberMatchesRemessa(current, order.notaRemessa)) return null;
    return current;
  }

  private async indexNfeChaves(
    dataInicial: string,
    dataFinal: string,
    onProgress?: (message: string) => void,
  ): Promise<Map<string, string>> {
    const chaveByNumero = new Map<string, string>();
    const windows = this.dateWindows(dataInicial, dataFinal, 15);
    let done = 0;
    for (const window of windows) {
      try {
        const rows = await this.listNotasWindow('/v1/notas-fiscais', {
          data_inicial: window.start,
          data_final: window.end,
        });
        for (const nf of rows) {
          const digits = nf.numeroDigits || nfNumberKey(nf.numero);
          const chave = String(nf.chaveAcesso ?? '').replace(/\D/g, '');
          if (digits && chave.length === 44 && !chaveByNumero.has(digits)) {
            chaveByNumero.set(digits, chave);
          }
        }
      } catch (err) {
        this.logger.warn(
          `Índice NF-e ${window.start}..${window.end}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      done += 1;
      if (done === 1 || done % 8 === 0 || done === windows.length) {
        onProgress?.(
          `Indexando chaves das NF-e... ${done} de ${windows.length} janelas (${chaveByNumero.size} notas)`,
        );
      }
    }
    return chaveByNumero;
  }

  private async loadNfeXmlDados(opts: {
    vendaId: string;
    orderId?: string | null;
    invoiceNumber?: string | null;
    around: Date;
    cache: Map<string, { dados: NfeXmlDados; raw: string }>;
    chaveByNumero?: Map<string, string>;
  }): Promise<{ dados: NfeXmlDados; raw: string } | { error: string }> {
    const invoiceHint = nfNumberKey(opts.invoiceNumber);
    if (opts.orderId && invoiceHint) {
      const cacheKey = `${opts.orderId}:${invoiceHint}`;
      const cached = opts.cache.get(cacheKey);
      if (cached) return cached;
      const stored = await this.readStoredXmlString(opts.orderId, invoiceHint);
      if (stored) {
        const dados = parseNfeXml(stored);
        if (dados) {
          const packed = { dados, raw: stored };
          opts.cache.set(cacheKey, packed);
          return packed;
        }
      }
    }

    let numero = invoiceHint;
    let chave =
      (numero ? opts.chaveByNumero?.get(numero) : null) ??
      (numero ? opts.chaveByNumero?.get(numero.replace(/^0+/, '')) : null) ??
      null;
    if (!numero) {
      const notas = await this.listNotasByVendaId(opts.vendaId, opts.around);
      const nfe = notas.find((n) => nfNumberKey(n.numero) || n.chaveAcesso) ?? notas[0];
      if (nfe) {
        numero = nfNumberKey(nfe.numero);
        const ch = String(nfe.chaveAcesso ?? '').replace(/\D/g, '');
        if (ch.length === 44) chave = ch;
        else if (numero) chave = opts.chaveByNumero?.get(numero) ?? chave;
      }
    }

    let buffer: Buffer | null = null;
    if (chave) {
      try {
        buffer = await this.apiGetBuffer(`/v1/notas-fiscais/${chave}`);
      } catch (err) {
        this.logger.warn(
          `XML chave ${chave}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (!buffer && numero) {
      try {
        const file = await this.downloadNotaFiscal(numero, {
          orderId: opts.orderId ?? undefined,
        });
        buffer = file.buffer;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!chave) return { error: msg };
      }
    }
    if (!buffer) {
      return {
        error: numero
          ? `XML da NF ${numero} não encontrado na Conta Azul`
          : 'Venda sem NF-e de produto na Conta Azul',
      };
    }
    try {
      const raw = extractNfeXml(buffer);
      const dados = parseNfeXml(raw);
      if (!dados) return { error: 'XML da NF-e não pôde ser interpretado' };
      if (opts.orderId && dados.invoiceNumber) {
        opts.cache.set(`${opts.orderId}:${nfNumberKey(dados.invoiceNumber)}`, {
          dados,
          raw,
        });
      }
      return { dados, raw };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'Falha ao extrair XML da NF-e',
      };
    }
  }

  private async readStoredXmlString(
    orderId: string,
    invoiceNumber: string,
  ): Promise<string | null> {
    const stored = await this.readStoredNotaArquivo(orderId, invoiceNumber, 'xml');
    if (!stored) return null;
    try {
      return extractNfeXml(stored.buffer);
    } catch {
      return null;
    }
  }

  private async applyVendasXmlPlans(input: {
    caso1: Caso1Plan[];
    caso2: Caso2Plan[];
  }): Promise<{
    pedidosCompletados: number;
    itensPreenchidos: number;
    itensAdicionados: number;
    itensCorrigidos: number;
    pedidosCriados: number;
  }> {
    let pedidosCompletados = 0;
    let itensPreenchidos = 0;
    let itensAdicionados = 0;
    let itensCorrigidos = 0;
    let pedidosCriados = 0;

    for (const plan of input.caso1) {
      const changed = await this.applyCaso1Plan(plan);
      if (changed) pedidosCompletados += 1;
      itensPreenchidos += plan.fills.length;
      itensAdicionados += plan.adds.length;
      itensCorrigidos += plan.replaces.length;
    }
    for (const plan of input.caso2) {
      const created = await this.applyCaso2Plan(plan);
      if (created) pedidosCriados += 1;
    }
    return {
      pedidosCompletados,
      itensPreenchidos,
      itensAdicionados,
      itensCorrigidos,
      pedidosCriados,
    };
  }

  private async applyCaso1Plan(plan: Caso1Plan): Promise<boolean> {
    return this.prisma.client.$transaction(async (tx) => {
      for (const fill of plan.fills) {
        const data: Prisma.OrderItemUpdateInput = {};
        if (fill.sku != null) data.sku = fill.sku;
        if (fill.description != null) data.description = fill.description;
        if (fill.unit != null) data.unit = fill.unit;
        if (fill.ncm != null) data.ncm = fill.ncm;
        if (fill.unitPrice != null) {
          data.unitPrice = new Prisma.Decimal(fill.unitPrice.toFixed(2));
        }
        if (fill.totalPrice != null) {
          data.totalPrice = new Prisma.Decimal(fill.totalPrice.toFixed(2));
        }
        if (Object.keys(data).length === 0) continue;
        await tx.orderItem.update({ where: { id: fill.itemId }, data });
      }
      for (const add of plan.adds) {
        await tx.orderItem.create({
          data: {
            orderId: plan.orderId,
            lineNumber: add.lineNumber,
            sku: add.sku,
            description: add.description,
            quantity: add.quantity,
            reservedQuantity: 0,
            missingQty: 0,
            pickedQty: 0,
            invoicedQty: add.quantity,
            unit: add.unit,
            ncm: add.ncm,
            unitPrice: new Prisma.Decimal(add.unitPrice.toFixed(2)),
            totalPrice: new Prisma.Decimal(add.totalPrice.toFixed(2)),
            discount: new Prisma.Decimal(0),
            productId: add.productId,
            stockStatus: OrderItemStockStatus.NAO_ANALISADO,
          },
        });
      }
      await this.applyItemReplacePatches(tx, plan.replaces);
      const orderPatch: Prisma.OrderUpdateInput = {};
      if (plan.preencherInvoice && plan.invoiceNumber) {
        orderPatch.invoiceNumber = plan.invoiceNumber;
        orderPatch.invoiceStatus = InvoiceStatus.INVOICED;
        orderPatch.invoicedAt = new Date();
      }
      if (Object.keys(orderPatch).length > 0) {
        await tx.order.update({
          where: { id: plan.orderId },
          data: orderPatch,
        });
      }
      if (plan.preencherVendaId) {
        await tx.$executeRaw`
          UPDATE "Order"
          SET "contaAzulVendaId" = ${plan.vendaId}, "updatedAt" = NOW()
          WHERE id = CAST(${plan.orderId} AS UUID)
            AND ("contaAzulVendaId" IS NULL OR "contaAzulVendaId" = ${plan.vendaId})
        `;
      }
      return (
        plan.fills.length > 0 ||
        plan.adds.length > 0 ||
        plan.replaces.length > 0 ||
        plan.preencherInvoice ||
        plan.preencherVendaId
      );
    });
  }

  private async applyCaso2Plan(plan: Caso2Plan): Promise<boolean> {
    const already = await this.prisma.client.$queryRaw<Array<{ id: string }>>`
      SELECT id::text AS id FROM "Order"
      WHERE "contaAzulVendaId" = ${plan.vendaId}
      LIMIT 1
    `;
    if (already.length > 0) return false;
    const invoiceTaken = plan.invoiceNumber
      ? await this.prisma.client.order.findFirst({
          where: { invoiceNumber: plan.invoiceNumber },
          select: { id: true },
        })
      : null;
    if (invoiceTaken) return false;

    const emitida = nfeEmitidaEmDate(plan.emitidaEm) ?? new Date();
    const total = new Prisma.Decimal(Number(plan.total || 0).toFixed(2));
    await this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${XML_VENDAS_NEXT_CODE_LOCK})`,
      );
      const rows = await tx.$queryRaw<Array<{ next: bigint }>>`
        SELECT (COALESCE(MAX(CAST(SPLIT_PART("code", '-', 2) AS INTEGER)), 0) + 1)::bigint AS next
        FROM "Order"
        WHERE "code" ~ '^PED-[0-9]+$'
      `;
      const code = `PED-${String(Number(rows[0]?.next ?? 1)).padStart(6, '0')}`;
      const created = await tx.order.create({
        data: {
          source: OrderSource.VENDA_EXTERNA,
          code,
          externalOrderNumber: plan.externalOrderNumber,
          customerId: plan.customerId,
          customerName: plan.customerName,
          customerDocument: plan.cnpj,
          deliveryCnpj: plan.cnpj,
          deliveryAddress: plan.deliveryAddress,
          deliveryCity: plan.deliveryCity,
          deliveryState: plan.deliveryState,
          receiverName: plan.customerName,
          invoiceNumber: plan.invoiceNumber,
          invoiceStatus: InvoiceStatus.INVOICED,
          invoicedAt: emitida,
          orderDate: emitida,
          status: OrderStatus.FINALIZADO,
          priority: 3,
          subtotal: total,
          discount: new Prisma.Decimal(0),
          total,
          totalValue: total,
          companyEntityId: plan.companyEntityId,
          notes: `Importado da Conta Azul (venda ${plan.vendaNumero ?? plan.vendaId}) — histórico, sem reserva de estoque.`,
          items: {
            create: plan.items.map((item) => ({
              lineNumber: item.lineNumber,
              sku: item.sku,
              description: item.description,
              quantity: item.quantity,
              reservedQuantity: 0,
              missingQty: 0,
              pickedQty: 0,
              invoicedQty: item.quantity,
              unit: item.unit,
              ncm: item.ncm,
              unitPrice: new Prisma.Decimal(item.unitPrice.toFixed(2)),
              totalPrice: new Prisma.Decimal(item.totalPrice.toFixed(2)),
              discount: new Prisma.Decimal(0),
              productId: item.productId,
              stockStatus: OrderItemStockStatus.NAO_ANALISADO,
            })),
          },
        },
        select: { id: true },
      });
      await tx.$executeRaw`
        UPDATE "Order"
        SET "contaAzulVendaId" = ${plan.vendaId}, "updatedAt" = NOW()
        WHERE id = CAST(${created.id} AS UUID)
          AND "contaAzulVendaId" IS NULL
      `;
    });
    return true;
  }

  private async applyInvoiceFills(
    rows: InvoiceFillPreview[],
  ): Promise<number> {
    let filled = 0;
    for (const row of rows) {
      const numero = String(row.invoiceNumber ?? '').trim();
      if (!numero || !invoiceNumberDigits(numero)) continue;
      const result = await this.prisma.client.$executeRaw`
        UPDATE "Order"
        SET
          "invoiceNumber" = ${numero},
          "invoiceStatus" = CAST(${InvoiceStatus.INVOICED} AS "InvoiceStatus"),
          "invoicedAt" = NOW(),
          "updatedAt" = NOW()
        WHERE id = CAST(${row.orderId} AS UUID)
          AND (
            "invoiceNumber" IS NULL
            OR btrim("invoiceNumber") = ''
            OR (
              "notaRemessa" IS NOT NULL
              AND btrim("notaRemessa") <> ''
              AND regexp_replace("invoiceNumber", '[^0-9]', '', 'g')
                = regexp_replace("notaRemessa", '[^0-9]', '', 'g')
            )
          )
      `;
      if (Number(result) > 0) filled += 1;
    }
    return filled;
  }

  private countUniqueVendaIds(
    orders: Array<{ contaAzulVendaId: string | null }>,
  ): number {
    const seen = new Set<string>();
    for (const order of orders) {
      const vendaId = String(order.contaAzulVendaId ?? '').trim();
      if (vendaId) seen.add(vendaId);
    }
    return seen.size;
  }

  private async collectNotasForInvoiceFill(
    orders: Array<{
      contaAzulVendaId: string | null;
      around?: Date | null;
    }>,
    onProgress?: (processed: number, total: number) => void,
  ): Promise<CaNfResumo[]> {
    const seen = new Set<string>();
    const unique: Array<{ vendaId: string; around: Date }> = [];
    for (const order of orders) {
      const vendaId = String(order.contaAzulVendaId ?? '').trim();
      if (!vendaId || seen.has(vendaId)) continue;
      seen.add(vendaId);
      unique.push({ vendaId, around: order.around ?? new Date() });
    }
    onProgress?.(0, unique.length);
    if (unique.length === 0) return [];

    const out: CaNfResumo[] = [];
    const batches = await mapLimit(
      unique,
      NF_LOOKUP_CONCURRENCY,
      (item) => this.listNotasByVendaId(item.vendaId, item.around),
      onProgress,
    );
    for (const notas of batches) out.push(...notas);
    return out;
  }

  /**
   * A listagem /v1/notas-fiscais aceita id_venda no filtro, mas o item
   * devolvido não traz esse campo — por isso a busca é por venda, não por
   * varredura de todas as NFs.
   */
  private async listNotasByVendaId(
    vendaId: string,
    around: Date,
  ): Promise<CaNfResumo[]> {
    const found = await this.listNotasByVendaWindows(vendaId, around);
    if (found.length > 0) return found;
    const compromisso = await this.vendaCompromissoDate(vendaId);
    if (
      compromisso &&
      Math.abs(compromisso.getTime() - around.getTime()) > 2 * 86400000
    ) {
      return this.listNotasByVendaWindows(vendaId, compromisso);
    }
    return [];
  }

  private async listNotasByVendaWindows(
    vendaId: string,
    around: Date,
  ): Promise<CaNfResumo[]> {
    for (const window of this.nfeLookupWindows(around).slice(0, 5)) {
      try {
        const rows = await this.listNotasWindow('/v1/notas-fiscais', {
          data_inicial: window.start,
          data_final: window.end,
          id_venda: vendaId,
        });
        if (rows.length > 0) {
          return rows.map((nf) => ({
            ...nf,
            idVenda: nf.idVenda || vendaId,
          }));
        }
      } catch (err) {
        this.logger.warn(
          `NF por venda ${vendaId} ${window.start}..${window.end}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return [];
  }

  private async vendaCompromissoDate(vendaId: string): Promise<Date | null> {
    try {
      const payload = (await this.apiGet(`/v1/venda/${vendaId}`)) as Record<
        string,
        unknown
      >;
      const venda =
        payload.venda && typeof payload.venda === 'object'
          ? (payload.venda as Record<string, unknown>)
          : payload;
      const raw = venda.data_compromisso ?? venda.data ?? payload.data;
      const d = raw ? new Date(String(raw)) : null;
      return d && Number.isFinite(d.getTime()) ? d : null;
    } catch (err) {
      this.logger.warn(
        `Venda ${vendaId} para data da NF: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private toSyncJobPublic(job: CaSyncJobInternal): CaSyncJobState {
    return {
      jobId: job.jobId,
      status: job.status,
      processedWindows: job.processedWindows,
      totalWindows: job.totalWindows,
      message: job.message,
      result: job.result,
      error: job.error,
    };
  }

  private toVendasJobPublic(job: CaVendasJobInternal): CaVendasJobState {
    return {
      jobId: job.jobId,
      status: job.status,
      processed: job.processed,
      total: job.total,
      apply: job.apply,
      message: job.message,
      result: job.result,
      error: job.error,
    };
  }

  private vendasProgressMessage(processed: number, total: number): string {
    if (total <= 0) return 'Processando... nenhuma venda a verificar';
    return `Processando... ${processed} de ${total} vendas verificadas`;
  }

  private pruneVendasJobs(): void {
    const limit = Date.now() - 6 * 60 * 60 * 1000;
    for (const [id, job] of this.vendasJobs) {
      if (job.createdAt.getTime() < limit) {
        this.vendasJobs.delete(id);
      }
    }
  }

  private toNfVinculoAuditJobPublic(
    job: CaNfVinculoAuditJobInternal,
  ): CaNfVinculoAuditJobState {
    return {
      jobId: job.jobId,
      status: job.status,
      processed: job.processed,
      total: job.total,
      message: job.message,
      result: job.result,
      error: job.error,
    };
  }

  private pruneNfVinculoAuditJobs(): void {
    const limit = Date.now() - 6 * 60 * 60 * 1000;
    for (const [id, job] of this.nfVinculoAuditJobs) {
      if (job.createdAt.getTime() < limit) {
        this.nfVinculoAuditJobs.delete(id);
      }
    }
  }

  private async loadAuditOrders(): Promise<AuditOrderInput[]> {
    const [orderRows, linkedRows, historyRows] = await Promise.all([
      this.prisma.client.order.findMany({
        select: {
          id: true,
          code: true,
          externalOrderNumber: true,
          invoiceNumber: true,
          notaRemessa: true,
          status: true,
          items: {
            select: {
              quantity: true,
              pickedQty: true,
              missingQty: true,
              invoicedQty: true,
            },
          },
        },
      }),
      this.prisma.client.$queryRaw<
        Array<{ id: string; contaAzulVendaId: string | null }>
      >`SELECT id::text AS id, "contaAzulVendaId" FROM "Order"`,
      this.prisma.client.orderInvoiceHistory.findMany({
        select: { orderId: true, invoiceNumber: true },
      }),
    ]);
    const linkedById = new Map(
      linkedRows.map((row) => [row.id, row.contaAzulVendaId]),
    );
    const historyByOrder = new Map<string, Array<{ invoiceNumber: string }>>();
    for (const row of historyRows) {
      const list = historyByOrder.get(row.orderId) ?? [];
      list.push({ invoiceNumber: row.invoiceNumber });
      historyByOrder.set(row.orderId, list);
    }
    return orderRows.map((o) => ({
      id: o.id,
      code: o.code,
      externalOrderNumber: o.externalOrderNumber,
      invoiceNumber: o.invoiceNumber,
      notaRemessa: o.notaRemessa,
      status: String(o.status),
      contaAzulVendaId: linkedById.get(o.id) ?? null,
      history: historyByOrder.get(o.id) ?? [],
      items: o.items,
    }));
  }

  private async processNfVinculoAuditJob(jobId: string): Promise<void> {
    const job = this.nfVinculoAuditJobs.get(jobId);
    if (!job) return;
    try {
      job.message = 'Carregando pedidos do ERP...';
      const orders = await this.loadAuditOrders();
      job.processed = 1;
      job.total = 4;
      const today = new Date();
      job.message = 'Buscando vendas na Conta Azul...';
      const dataInicial = await this.findHistoryStart(today);
      const vendas = await this.listAllVendas(dataInicial, this.ymd(today));
      job.processed = 3;
      job.message = 'Revalidando vínculos com a lógica WEG corrigida...';
      const audit = planNfVinculoAudit({ orders, vendas });
      const cleanup = planOldCompletedCleanup(orders);
      const spotlightNums = ['4517818598', '4519085342'];
      const spotlight = {
        erp: orders.filter((o) => {
          const ext = String(o.externalOrderNumber ?? '');
          return spotlightNums.some((n) => ext === n || ext.startsWith(n));
        }),
        mismatches: audit.mismatches.filter((row) => {
          const ext = String(row.externalOrderNumber ?? '');
          const exp = String(row.expectedExternal ?? '');
          return spotlightNums.some(
            (n) => ext.startsWith(n) || exp.startsWith(n),
          );
        }),
      };
      job.result = {
        ok: true,
        apply: false,
        vendas: vendas.length,
        pedidos: orders.length,
        ordersAffected: audit.ordersAffected,
        mismatchCount: audit.mismatches.length,
        byKind: audit.byKind,
        mismatches: audit.mismatches,
        oldCompletedCleanup: cleanup,
        spotlight,
        message: `Dry-run: ${audit.ordersAffected} pedido(s) com vínculo de NF suspeito em ${audit.mismatches.length} ocorrência(s). Nenhuma correção aplicada.`,
      };
      job.status = 'concluido';
      job.processed = 4;
      job.message = job.result.message;
    } catch (err) {
      job.status = 'erro';
      job.error = err instanceof Error ? err.message : String(err);
      job.message = 'Falha na auditoria de vínculos NF.';
      this.logger.error(
        `Auditoria vínculos NF: ${job.error}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  private async processVendasJob(jobId: string): Promise<void> {
    const job = this.vendasJobs.get(jobId);
    if (!job) return;
    try {
      const result = await this.sincronizarVendas({
        apply: job.apply,
        onProgress: (update) => {
          if (update.processed != null) job.processed = update.processed;
          if (update.total != null) job.total = update.total;
          job.message = update.message;
        },
      });
      job.status = 'concluido';
      job.result = result;
      job.message = result.message;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      job.status = 'erro';
      job.error = message;
      job.message = message;
    }
    this.pruneVendasJobs();
  }

  private toXmlVendasJobPublic(job: CaXmlVendasJobInternal): CaXmlVendasJobState {
    return {
      jobId: job.jobId,
      status: job.status,
      processed: job.processed,
      total: job.total,
      apply: job.apply,
      message: job.message,
      result: job.result,
      error: job.error,
    };
  }

  private pruneXmlVendasJobs(): void {
    const limit = Date.now() - 6 * 60 * 60 * 1000;
    for (const [id, job] of this.xmlVendasJobs) {
      if (job.createdAt.getTime() < limit) {
        this.xmlVendasJobs.delete(id);
      }
    }
  }

  private async processXmlVendasJob(jobId: string): Promise<void> {
    const job = this.xmlVendasJobs.get(jobId);
    if (!job) return;
    try {
      const result = await this.processarVendasXml({
        apply: job.apply,
        onProgress: (update) => {
          if (update.processed != null) job.processed = update.processed;
          if (update.total != null) job.total = update.total;
          job.message = update.message;
        },
      });
      job.status = 'concluido';
      job.result = result;
      job.message = result.message;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      job.status = 'erro';
      job.error = message;
      job.message = message;
    }
    this.pruneXmlVendasJobs();
  }

  private toItensExternosXmlJobPublic(
    job: CaItensExternosXmlJobInternal,
  ): CaItensExternosXmlJobState {
    return {
      jobId: job.jobId,
      status: job.status,
      processed: job.processed,
      total: job.total,
      apply: job.apply,
      message: job.message,
      result: job.result,
      error: job.error,
    };
  }

  private pruneItensExternosXmlJobs(): void {
    const limit = Date.now() - 6 * 60 * 60 * 1000;
    for (const [id, job] of this.itensExternosXmlJobs) {
      if (job.createdAt.getTime() < limit) {
        this.itensExternosXmlJobs.delete(id);
      }
    }
  }

  private async processItensExternosXmlJob(jobId: string): Promise<void> {
    const job = this.itensExternosXmlJobs.get(jobId);
    if (!job) return;
    try {
      const result = await this.processarItensExternosXml({
        apply: job.apply,
        pedido: job.pedido,
        onProgress: (update) => {
          if (update.processed != null) job.processed = update.processed;
          if (update.total != null) job.total = update.total;
          job.message = update.message;
        },
      });
      job.status = 'concluido';
      job.result = result;
      job.message = result.message;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      job.status = 'erro';
      job.error = message;
      job.message = message;
    }
    this.pruneItensExternosXmlJobs();
  }

  private toSincronizacaoCompletaJobPublic(
    job: CaSincronizacaoCompletaJobInternal,
  ): CaSincronizacaoCompletaJobState {
    return {
      jobId: job.jobId,
      status: job.status,
      processed: job.processed,
      total: job.total,
      apply: job.apply,
      message: job.message,
      result: job.result,
      error: job.error,
    };
  }

  private pruneSincronizacaoCompletaJobs(): void {
    const limit = Date.now() - 6 * 60 * 60 * 1000;
    for (const [id, job] of this.sincronizacaoCompletaJobs) {
      if (job.createdAt.getTime() < limit) {
        this.sincronizacaoCompletaJobs.delete(id);
      }
    }
  }

  private async processSincronizacaoCompletaJob(jobId: string): Promise<void> {
    const job = this.sincronizacaoCompletaJobs.get(jobId);
    if (!job) return;
    try {
      const result = await this.processarSincronizacaoCompleta({
        apply: job.apply,
        onProgress: (update) => {
          if (update.processed != null) job.processed = update.processed;
          if (update.total != null) job.total = update.total;
          job.message = update.message;
        },
      });
      job.status = 'concluido';
      job.result = result;
      job.message = result.message;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      job.status = 'erro';
      job.error = message;
      job.message = message;
    }
    this.pruneSincronizacaoCompletaJobs();
  }

  private async processarSincronizacaoCompleta(options: {
    apply: boolean;
    onProgress?: (update: {
      processed?: number;
      total?: number;
      message: string;
    }) => void;
  }): Promise<CaSincronizacaoCompletaReport> {
    const apply = options.apply;
    const reportProgress = (processed: number, message: string) =>
      options.onProgress?.({ processed, total: 5, message });

    reportProgress(1, 'Etapa 1/5: cadastros reais (Customer/Supplier/Carrier)...');
    const cadastros = await this.sincronizarCadastros({ apply });

    reportProgress(2, 'Etapa 2/5: correção de itens WEG via XML (nItemPed)...');
    const itensExternos = await this.processarItensExternosXml({ apply });

    reportProgress(3, 'Etapa 3/5: XML das NFs (Caso 1 completar / Caso 2 criar)...');
    const xmlVendas = await this.processarVendasXml({ apply });

    reportProgress(4, 'Etapa 4/5: XML/DANFE de notas antigas (pré-ERP)...');
    const pending = await this.listPendingNotaArquivos(80);
    let saved = 0;
    let skipped = 0;
    if (apply) {
      const sync = await this.syncPendingNotaArquivos(200);
      saved = sync.saved;
      skipped = sync.skipped;
    }
    const notasAntigas = {
      pending: pending.length,
      saved,
      skipped,
      preview: pending.slice(0, 20),
      message: apply
        ? `Aplicado: ${saved} XML/DANFE gravado(s), ${skipped} pendente(s)/falha(s).`
        : `Dry-run: ${pending.length} NF(s) sem XML/DANFE persistido. Nada baixado.`,
    };

    reportProgress(5, 'Etapa 5/5: formato do número da NF (sem série)...');
    const formatoNf = await this.previewFormatoNfSemSerie();

    const report: CaSincronizacaoCompletaReport = {
      ok: true,
      apply,
      applied: apply,
      cadastros: {
        criar: cadastros.erpApply.criar,
        atualizar: cadastros.erpApply.atualizar,
        message: cadastros.message,
      },
      itensExternos: {
        corrections: itensExternos.corrections,
        xmlsParsed: itensExternos.xmlsParsed,
        xmlsMissing: itensExternos.xmlsMissing,
        preview: itensExternos.preview,
        message: itensExternos.message,
      },
      xmlVendas: {
        caso1: xmlVendas.caso1,
        caso1Completar: xmlVendas.caso1Completar,
        caso2: xmlVendas.caso2,
        caso1ItensCorrigidos: xmlVendas.caso1ItensCorrigidos,
        message: xmlVendas.message,
      },
      notasAntigas,
      formatoNf,
      message: '',
    };
    report.message = apply
      ? [
          cadastros.message,
          itensExternos.message,
          xmlVendas.message,
          notasAntigas.message,
          formatoNf.message,
        ].join(' ')
      : `Dry-run completo: cadastros (criar ${cadastros.erpApply.criar.customers} clientes / ${cadastros.erpApply.criar.suppliers} fornecedores / ${cadastros.erpApply.criar.carriers} transportadoras); ${itensExternos.corrections} item(ns) WEG a corrigir; Caso 1 ${xmlVendas.caso1Completar} a completar / Caso 2 ${xmlVendas.caso2} Venda Externa; ${pending.length} NF(s) antigas sem XML/DANFE. Nada gravado.`;
    return report;
  }

  private async previewFormatoNfSemSerie(): Promise<{
    comPrefixoSerie: number;
    preview: Array<{ from: string; to: string }>;
    message: string;
  }> {
    const rows = await this.prisma.client.order.findMany({
      where: { invoiceNumber: { contains: ' - ' } },
      select: { invoiceNumber: true },
      take: 200,
    });
    const preview: Array<{ from: string; to: string }> = [];
    let comPrefixoSerie = 0;
    for (const row of rows) {
      const from = String(row.invoiceNumber ?? '').trim();
      const to = displayInvoiceNumber(from);
      if (from && to && from !== to) {
        comPrefixoSerie += 1;
        if (preview.length < 12) preview.push({ from, to });
      }
    }
    return {
      comPrefixoSerie,
      preview,
      message:
        'Exibição da NF já usa só o número (sem série). O valor gravado no banco não é reescrito.',
    };
  }

  private async readXmlByStorageKey(key: string): Promise<string | null> {
    if (!this.storageConfigured() || !this.storage) return null;
    try {
      const stored = await this.storage.getObjectBuffer(key);
      return extractNfeXml(stored.buffer);
    } catch {
      return null;
    }
  }

  private async applyItemReplacePatches(
    tx: Prisma.TransactionClient,
    replaces: ItemReplacePatch[],
  ): Promise<{ created: number }> {
    let created = 0;
    for (const replace of replaces) {
      const existing = await tx.orderItem.findUnique({
        where: { id: replace.itemId },
        select: { quantity: true },
      });
      if (!existing) continue;
      const ensured = await this.externalItems.ensureByName({
        name: replace.externalItemName,
        lastKnownPrice: replace.unitPrice,
        source: 'XML NFe',
      });
      if (!replace.reuseExternalItemId) created += 1;
      const unitPrice = new Prisma.Decimal(Number(replace.unitPrice).toFixed(2));
      await tx.orderItem.update({
        where: { id: replace.itemId },
        data: {
          description: replace.toDescription,
          sku: replace.toSku,
          ncm: replace.ncm,
          unit: replace.unit,
          unitPrice,
          totalPrice: unitPrice.mul(existing.quantity).toDecimalPlaces(2),
          product: { disconnect: true },
          externalItem: { connect: { id: ensured.id } },
        },
      });
    }
    return { created };
  }

  private async readXmlForVendaNf(opts: {
    orderId: string;
    numero: string;
    chaveAcesso: string | null;
    storedKey: string | null;
    persist: boolean;
  }): Promise<string | null> {
    const key = opts.storedKey?.trim();
    if (key) {
      const stored = await this.readXmlByStorageKey(key);
      if (stored) return stored;
    }
    const chave = String(opts.chaveAcesso ?? '').replace(/\D/g, '');
    if (chave.length !== 44) return null;
    try {
      const buffer = await this.apiGetBuffer(`/v1/notas-fiscais/${chave}`);
      if (!buffer.length) return null;
      if (opts.persist) {
        const kind = detectCaNfFile(buffer);
        await this.persistNotaArquivo(
          opts.orderId,
          opts.numero,
          'xml',
          buffer,
          kind.mime,
        );
      }
      return extractNfeXml(buffer);
    } catch {
      return null;
    }
  }

  private async processarItensExternosXml(options: {
    apply: boolean;
    pedido?: string;
    onProgress?: (update: {
      processed?: number;
      total?: number;
      message: string;
    }) => void;
  }): Promise<CaItensExternosXmlReport> {
    const pedido = options.pedido?.trim();
    const reportProgress = (update: {
      processed?: number;
      total?: number;
      message: string;
    }) => options.onProgress?.(update);

    reportProgress({ message: 'Buscando pedidos com XML armazenado...' });
    const pedidoWhere = pedido
      ? {
          OR: [
            { externalOrderNumber: pedido },
            { code: { equals: pedido, mode: 'insensitive' as const } },
          ],
        }
      : undefined;
    const itemSelect = {
      id: true,
      lineNumber: true,
      sku: true,
      description: true,
      quantity: true,
      productId: true,
      unitPrice: true,
      ncm: true,
      unit: true,
      product: { select: { name: true } },
    } as const;
    const histories = await this.prisma.client.orderInvoiceHistory.findMany({
      where: {
        ...(pedido
          ? { order: pedidoWhere }
          : { xmlStorageKey: { not: null } }),
      },
      select: {
        invoiceNumber: true,
        xmlStorageKey: true,
        order: {
          select: {
            id: true,
            code: true,
            externalOrderNumber: true,
            customerName: true,
            invoiceNumber: true,
            contaAzulVendaId: true,
            orderDate: true,
            createdAt: true,
            invoicedAt: true,
            items: { select: itemSelect },
          },
        },
      },
    });

    type HistoryRow = (typeof histories)[number];
    type OrderBundle = {
      order: HistoryRow['order'];
      storedByNf: Map<string, string | null>;
    };
    const byOrder = new Map<string, OrderBundle>();
    const addHistory = (row: HistoryRow) => {
      let bundle = byOrder.get(row.order.id);
      if (!bundle) {
        bundle = { order: row.order, storedByNf: new Map() };
        byOrder.set(row.order.id, bundle);
      }
      for (const n of invoiceNumberDigitList(row.invoiceNumber)) {
        if (!bundle.storedByNf.has(n)) {
          bundle.storedByNf.set(n, row.xmlStorageKey);
        }
      }
    };
    for (const history of histories) addHistory(history);

    if (pedido) {
      const orders = await this.prisma.client.order.findMany({
        where: pedidoWhere,
        select: {
          id: true,
          code: true,
          externalOrderNumber: true,
          customerName: true,
          invoiceNumber: true,
          contaAzulVendaId: true,
          orderDate: true,
          createdAt: true,
          invoicedAt: true,
          items: { select: itemSelect },
        },
      });
      for (const order of orders) {
        if (byOrder.has(order.id)) continue;
        byOrder.set(order.id, { order, storedByNf: new Map() });
      }
    }

    const catalog = await this.prisma.client.externalItem.findMany({
      select: { id: true, name: true },
    });
    const previewLimit = 40;
    const preview: CaItensExternosXmlCorrection[] = [];
    const toApply: Array<{
      patch: ItemReplacePatch;
      row: CaItensExternosXmlCorrection;
    }> = [];
    const seenItems = new Set<string>();
    const vendaNotasCache = new Map<string, CaNfResumo[]>();
    let xmlsParsed = 0;
    let xmlsMissing = 0;
    const bundles = [...byOrder.values()];
    const scannedIds = new Set<string>();
    const total = bundles.length;

    for (let i = 0; i < bundles.length; i += 1) {
      const { order, storedByNf } = bundles[i];
      reportProgress({
        processed: i + 1,
        total,
        message: `Revalidando venda ${i + 1} de ${total}...`,
      });
      const vendaId = String(order.contaAzulVendaId ?? '').trim();
      if (!vendaId) continue;
      scannedIds.add(order.id);
      const around =
        order.invoicedAt ?? order.orderDate ?? order.createdAt ?? new Date();
      let notas: CaNfResumo[] = [];
      try {
        const cached = vendaNotasCache.get(vendaId);
        if (cached) {
          notas = cached;
        } else {
          notas = await this.listNotasByVendaId(vendaId, around);
          vendaNotasCache.set(vendaId, notas);
        }
      } catch {
        xmlsMissing += 1;
        continue;
      }
      if (notas.length === 0) {
        xmlsMissing += 1;
        continue;
      }

      for (const nf of notas) {
        const numero =
          nf.numeroDigits ||
          nfNumberKey(nf.numero) ||
          invoiceNumberDigits(nf.numero);
        if (!numero) continue;
        const raw = await this.readXmlForVendaNf({
          orderId: order.id,
          numero,
          chaveAcesso: nf.chaveAcesso,
          storedKey: storedByNf.get(numero) ?? null,
          persist: options.apply,
        });
        if (!raw) {
          xmlsMissing += 1;
          continue;
        }
        const dados = parseNfeXml(raw);
        if (!dados?.items.length) {
          xmlsMissing += 1;
          continue;
        }
        xmlsParsed += 1;
        const patches = planWrongWegItemReplaces({
          orderItems: order.items.map((it) => ({
            id: it.id,
            lineNumber: it.lineNumber,
            sku: it.sku,
            description: it.description,
            quantity: it.quantity,
            productId: it.productId,
            productName: it.product?.name ?? null,
            unitPrice: Number(it.unitPrice) || 0,
            ncm: it.ncm,
            unit: it.unit,
          })),
          xmlItems: dados.items,
          externalItems: catalog,
        });
        const pedidoNumero = displayPedidoNumero(order);
        const invoiceDisplay = displayInvoiceNumber(numero) || numero;
        for (const patch of patches) {
          if (seenItems.has(patch.itemId)) continue;
          seenItems.add(patch.itemId);
          const row: CaItensExternosXmlCorrection = {
            orderId: order.id,
            orderCode: pedidoNumero || order.externalOrderNumber || '',
            externalOrderNumber: order.externalOrderNumber,
            invoiceNumber: invoiceDisplay,
            customerName: order.customerName,
            itemId: patch.itemId,
            fromDescription: patch.fromDescription,
            toDescription: patch.toDescription,
            fromSku: patch.fromSku,
            toSku: patch.toSku,
            productName: patch.productName,
            unitPrice: patch.unitPrice,
            createExternalItem: !patch.reuseExternalItemId,
            reuseExternalItemId: patch.reuseExternalItemId,
            externalItemName: patch.externalItemName,
          };
          if (preview.length < previewLimit) preview.push(row);
          toApply.push({ patch, row });
        }
      }
    }

    const report: CaItensExternosXmlReport = {
      ok: true,
      apply: options.apply,
      applied: false,
      ordersScanned: scannedIds.size,
      xmlsParsed,
      xmlsMissing,
      corrections: toApply.length,
      preview,
      message: '',
    };
    report.message = options.apply
      ? ''
      : `Dry-run: ${report.corrections} item(ns) WEG divergente(s) do XML em ${report.ordersScanned} pedido(s) (${report.xmlsParsed} XML lido(s), ${report.xmlsMissing} sem XML). Nada gravado.`;

    if (!options.apply) return report;

    reportProgress({ message: 'Aplicando correções...' });
    let itemsUpdated = 0;
    let externalItemsCreated = 0;
    await this.prisma.client.$transaction(async (tx) => {
      const applied = await this.applyItemReplacePatches(
        tx,
        toApply.map((row) => row.patch),
      );
      itemsUpdated = toApply.length;
      externalItemsCreated = applied.created;
    });

    return {
      ...report,
      applied: true,
      appliedCounts: { itemsUpdated, externalItemsCreated },
      message: `Aplicado: ${itemsUpdated} item(ns) corrigido(s), ${externalItemsCreated} Item Externo criado(s).`,
    };
  }

  private syncProgressMessage(processed: number, total: number): string {
    if (total <= 0) return 'Sincronizando...';
    return `Sincronizando... ${processed} de ${total} janelas processadas`;
  }

  private pruneSyncJobs(): void {
    const limit = Date.now() - 6 * 60 * 60 * 1000;
    for (const [id, job] of this.syncJobs) {
      if (job.createdAt.getTime() < limit) {
        this.syncJobs.delete(id);
      }
    }
  }

  private async processSyncJob(jobId: string): Promise<void> {
    const job = this.syncJobs.get(jobId);
    if (!job) return;
    try {
      job.message = 'Localizando início do histórico...';
      const result = await this.syncAll(undefined, (processed, total) => {
        job.processedWindows = processed;
        job.totalWindows = total;
        job.message = this.syncProgressMessage(processed, total);
      });
      job.status = 'concluido';
      job.result = result;
      job.message = `Sincronização concluída: ${result.nfs} NF(s), ${result.receber} a receber, ${result.pagar} a pagar.`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      job.status = 'erro';
      job.error = message;
      job.message = message;
    }
    this.pruneSyncJobs();
  }

  async syncAll(
    daysBack?: number,
    onProgress?: (processed: number, total: number) => void,
  ): Promise<CaSyncJobResult> {
    this.ensureConfigured();
    const today = new Date();
    const dataFinal = this.ymd(today);
    const dataInicial =
      daysBack && daysBack > 0
        ? this.ymd(
            this.addUtcDays(
              today,
              -Math.max(30, Math.min(5475, daysBack)),
            ),
          )
        : await this.findHistoryStart(today);
    const vencAte = this.ymd(this.addUtcDays(today, 365));

    try {
      await this.getCategorias(1, 10);
      const nfWindows = this.dateWindows(dataInicial, dataFinal, 15);
      const finWindows = this.dateWindows(dataInicial, vencAte, 31);
      const totalWindows = nfWindows.length + finWindows.length * 2;
      let processedWindows = 0;
      onProgress?.(0, totalWindows);
      const onWindow = () => {
        processedWindows += 1;
        onProgress?.(processedWindows, totalWindows);
      };
      this.logger.log(
        `Conta Azul sync período ${dataInicial}..${dataFinal} (${nfWindows.length} janelas de NF de 15d).`,
      );
      const nfs = await this.listAllNotas(dataInicial, dataFinal, onWindow);
      const receber = await this.listFinanceiroTitulos(
        '/v1/financeiro/eventos-financeiros/contas-a-receber/buscar',
        dataInicial,
        vencAte,
        'receber',
        onWindow,
      );
      const pagar = await this.listFinanceiroTitulos(
        '/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar',
        dataInicial,
        vencAte,
        'pagar',
        onWindow,
      );

      await this.replaceTitulos([...receber, ...pagar]);
      const financeiroAtualizados = await this.applyFinanceiroFromCa(nfs, receber);
      const lastSyncAt = new Date();
      await this.persistSyncMeta(lastSyncAt, null);

      this.logger.log(
        `Conta Azul sync: ${receber.length} receber, ${pagar.length} pagar, ${nfs.length} NF(s), ${financeiroAtualizados} FinanceiroNF.`,
      );

      return {
        ok: true,
        receber: receber.length,
        pagar: pagar.length,
        nfs: nfs.length,
        financeiroAtualizados,
        lastSyncAt: lastSyncAt.toISOString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.persistSyncMeta(null, message.slice(0, 500), true);
      throw err;
    }
  }

  async hasCompletedSync(): Promise<boolean> {
    const meta = await this.loadSyncMeta();
    return Boolean(meta.lastSyncAt);
  }

  async listStoredTitulos(tipo?: 'RECEBER' | 'PAGAR'): Promise<CaTitulo[]> {
    try {
      const rows = tipo
        ? await this.prisma.client.$queryRaw<StoredTituloRow[]>`
            SELECT * FROM "ContaAzulTitulo" WHERE "tipo" = ${tipo}
          `
        : await this.prisma.client.$queryRaw<StoredTituloRow[]>`
            SELECT * FROM "ContaAzulTitulo"
          `;
      return rows.map(rowToTitulo);
    } catch (err) {
      this.logger.warn(
        `ContaAzulTitulo indisponível: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  async getCalendarioMes(year: number, month: number) {
    const y = Number.isFinite(year) ? year : new Date().getUTCFullYear();
    const m = Number.isFinite(month) ? month : new Date().getUTCMonth() + 1;
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    const synced = await this.hasCompletedSync();
    const stored = synced ? await this.listStoredTitulos() : [];
    const source = synced ? ('conta_azul' as const) : ('erp' as const);
    const titulos = synced
      ? stored.filter((t) => t.vencimento >= start && t.vencimento <= end)
      : await this.loadErpFallbackTitulos(start, end);
    return {
      source,
      year: y,
      month: m,
      days: groupTitulosByDay(titulos),
    };
  }

  /**
   * XML (ou ZIP com CC-e) da NF-e na Conta Azul.
   * A API v2 não oferece DANFE/PDF neste endpoint — confirmado na conta real.
   */
  async downloadNotaFiscal(
    invoiceNumber: string,
    opts?: { orderId?: string; persist?: boolean },
  ): Promise<{
    buffer: Buffer;
    contentType: string;
    filename: string;
  }> {
    const numero = nfNumberKey(invoiceNumber);
    if (!numero) {
      throw new BadRequestException(
        'Informe o número da Nota de Venda (NF) para baixar o arquivo.',
      );
    }
    if (opts?.orderId) {
      await this.assertNotRemessaForDownload(opts.orderId, invoiceNumber);
      const stored = await this.readStoredNotaArquivo(
        opts.orderId,
        numero,
        'xml',
      );
      if (stored) return stored;
    }
    this.ensureConfigured();
    const lookup = await this.resolveNfLookupContext(numero, opts?.orderId);
    const chave =
      lookup.chave ??
      (await this.resolveChaveAcesso(numero, lookup.around, {
        deep: lookup.deep,
      }));
    if (!chave) {
      throw new NotFoundException(
        `O XML da NF ${numero} não foi localizado na Conta Azul. Confira o número ou reconecte a conta.`,
      );
    }
    let buffer: Buffer;
    try {
      buffer = await this.apiGetBuffer(`/v1/notas-fiscais/${chave}`);
    } catch (err) {
      const ax = err as AxiosError;
      if (ax.response?.status === 404) {
        throw new NotFoundException(
          `O XML da NF ${numero} não foi localizado na Conta Azul.`,
        );
      }
      throw err;
    }
    if (!buffer.length) {
      throw new ServiceUnavailableException(
        'A Conta Azul devolveu um arquivo vazio para esta nota.',
      );
    }
    const kind = detectCaNfFile(buffer);
    if (opts?.persist && opts.orderId) {
      await this.persistNotaArquivo(
        opts.orderId,
        numero,
        'xml',
        buffer,
        kind.mime,
      );
    }
    return {
      buffer,
      contentType: 'application/octet-stream',
      filename: nfeDownloadFilename(numero, kind.ext),
    };
  }

  /**
   * DANFE em PDF a partir do XML real da Conta Azul.
   * A API v2 não entrega PDF; convertemos o XML (ou o XML dentro do ZIP).
   */
  async downloadDanfe(
    invoiceNumber: string,
    opts?: { orderId?: string; persist?: boolean },
  ): Promise<{
    buffer: Buffer;
    contentType: string;
    filename: string;
  }> {
    const numero = nfNumberKey(invoiceNumber);
    if (opts?.orderId) {
      await this.assertNotRemessaForDownload(opts.orderId, invoiceNumber);
    }
    if (opts?.orderId && numero) {
      const stored = await this.readStoredNotaArquivo(
        opts.orderId,
        numero,
        'danfe',
      );
      if (stored) return stored;
    }
    const file = await this.downloadNotaFiscal(invoiceNumber, opts);
    const kind = detectCaNfFile(file.buffer);
    if (kind.ext === 'pdf') {
      if (opts?.persist && opts.orderId && numero) {
        await this.persistNotaArquivo(
          opts.orderId,
          numero,
          'danfe',
          file.buffer,
          'application/pdf',
        );
      }
      return {
        buffer: file.buffer,
        contentType: 'application/pdf',
        filename: danfeDownloadFilename(invoiceNumber),
      };
    }
    try {
      const xml = extractNfeXml(file.buffer);
      const buffer = await xmlToDanfePdf(xml);
      if (opts?.persist && opts.orderId && numero) {
        await this.persistNotaArquivo(
          opts.orderId,
          numero,
          'danfe',
          buffer,
          'application/pdf',
        );
      }
      return {
        buffer,
        contentType: 'application/pdf',
        filename: danfeDownloadFilename(invoiceNumber),
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(
        `Não foi possível gerar o DANFE a partir do XML da Conta Azul. ${detail}`,
      );
    }
  }

  /**
   * Pedidos com NF sem XML/Nota persistidos: busca na CA e grava no storage.
   * 404 / nota em processamento → tenta de novo no próximo ciclo.
   */
  async syncPendingNotaArquivos(limit = 40): Promise<{
    scanned: number;
    saved: number;
    skipped: number;
  }> {
    if (!this.storageConfigured()) {
      this.logger.warn(
        'Conta Azul XML/Nota automático: storage R2 não configurado.',
      );
      return { scanned: 0, saved: 0, skipped: 0 };
    }
    if (this.notaArquivoSyncRunning) {
      return { scanned: 0, saved: 0, skipped: 0 };
    }
    this.notaArquivoSyncRunning = true;
    let saved = 0;
    let skipped = 0;
    try {
      const pending = await this.listPendingNotaArquivos(limit);
      for (const row of pending) {
        try {
          await this.downloadDanfe(row.invoiceNumber, {
            orderId: row.orderId,
            persist: true,
          });
          saved += 1;
          this.logger.log(
            `Conta Azul XML/Nota automático: pedido ${row.orderId} NF ${row.invoiceNumber} vinculado.`,
          );
        } catch (err) {
          if (err instanceof NotFoundException) {
            skipped += 1;
            continue;
          }
          this.logger.warn(
            `Conta Azul XML/Nota automático NF ${row.invoiceNumber}: ${err instanceof Error ? err.message : String(err)}`,
          );
          skipped += 1;
        }
      }
      return { scanned: pending.length, saved, skipped };
    } finally {
      this.notaArquivoSyncRunning = false;
    }
  }

  async getCategorias(pagina = 1, tamanhoPagina = 10) {
    return this.apiGet('/v1/categorias', {
      pagina,
      tamanho_pagina: tamanhoPagina,
      permite_apenas_filhos: false,
    });
  }

  /**
   * Sonda os endpoints relevantes na conta de teste e devolve
   * status + chaves reais do primeiro item (não inventa campos).
   */
  async probeTestAccount() {
    const today = new Date();
    const dataFinal = this.ymd(today);
    const past = new Date(today);
    past.setUTCDate(past.getUTCDate() - 90);
    const dataInicial = this.ymd(past);
    const vencDe = this.ymd(new Date(today.getTime() - 30 * 86400000));
    const vencAte = this.ymd(new Date(today.getTime() + 60 * 86400000));
    const nfDe = this.ymd(new Date(today.getTime() - 14 * 86400000));

    const calls: Array<{
      id: string;
      path: string;
      params?: Record<string, string | number | boolean>;
    }> = [
      {
        id: 'categorias',
        path: '/v1/categorias',
        params: {
          pagina: 1,
          tamanho_pagina: 10,
          permite_apenas_filhos: false,
        },
      },
      {
        id: 'conta_conectada',
        path: '/v1/pessoas/conta-conectada',
      },
      {
        id: 'pessoas',
        path: '/v1/pessoas',
        params: { pagina: 1, tamanho_pagina: 10 },
      },
      {
        id: 'notas_fiscais',
        path: '/v1/notas-fiscais',
        params: {
          data_inicial: nfDe,
          data_final: dataFinal,
          pagina: 1,
          tamanho_pagina: 10,
        },
      },
      {
        id: 'notas_fiscais_servico',
        path: '/v1/notas-fiscais-servico',
        params: {
          data_competencia_de: nfDe,
          data_competencia_ate: dataFinal,
          pagina: 1,
          tamanho_pagina: 10,
        },
      },
      {
        id: 'contas_a_receber',
        path: '/v1/financeiro/eventos-financeiros/contas-a-receber/buscar',
        params: {
          pagina: 1,
          tamanho_pagina: 10,
          data_vencimento_de: vencDe,
          data_vencimento_ate: vencAte,
        },
      },
      {
        id: 'contas_a_pagar',
        path: '/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar',
        params: {
          pagina: 1,
          tamanho_pagina: 10,
          data_vencimento_de: vencDe,
          data_vencimento_ate: vencAte,
        },
      },
    ];

    const results = [];
    for (const call of calls) {
      results.push(await this.probeOne(call.id, call.path, call.params));
    }

    return {
      documented: CONTA_AZUL_DOCUMENTED_ENDPOINTS,
      probedAt: new Date().toISOString(),
      period: { dataInicial, dataFinal, vencDe, vencAte, nfDe, nfAte: dataFinal },
      results,
    };
  }

  /**
   * Conta de teste apenas: cria uma venda mínima e tenta rotas de emissão
   * de NF (não documentadas). Apaga a venda no final. Não toca produção.
   */
  async probeSaleAndInvoiceEmission() {
    const today = this.ymd(new Date());
    const lookups = {
      pessoas: await this.probeOne('pessoas', '/v1/pessoas', {
        pagina: 1,
        tamanho_pagina: 20,
      }),
      produtos: await this.probeOne('produtos', '/v1/produtos', {
        pagina: 1,
        tamanho_pagina: 20,
        status: 'ATIVO',
      }),
      contasFinanceiras: await this.probeOne(
        'conta_financeira',
        '/v1/conta-financeira',
        { pagina: 1, tamanho_pagina: 20, apenas_ativo: true },
      ),
      categorias: await this.probeOne('categorias', '/v1/categorias', {
        pagina: 1,
        tamanho_pagina: 50,
        permite_apenas_filhos: false,
      }),
      proximoNumero: await this.probeOne(
        'proximo_numero',
        '/v1/venda/proximo-numero',
      ),
      vendedores: await this.probeOne('vendedores', '/v1/venda/vendedores'),
    };

    const cliente = lookups.pessoas.firstItem;
    const produto = lookups.produtos.firstItem;
    const conta = lookups.contasFinanceiras.firstItem;
    const categoria = lookups.categorias.firstItem;
    const numeroRaw = lookups.proximoNumero.ok
      ? lookups.proximoNumero.sample
      : null;
    const numero =
      typeof numeroRaw === 'number'
        ? numeroRaw
        : Number(
            (numeroRaw as { numero?: number } | null)?.numero ??
              Date.now() % 1_000_000,
          );

    const clienteId = this.asId(cliente);
    const produtoId = this.asId(produto);
    const produtoValor = this.asNumber(
      produto && typeof produto === 'object'
        ? (produto as Record<string, unknown>).valor_venda ??
            (produto as Record<string, unknown>).valor ??
            10
        : 10,
      10,
    );

    const createBody = clienteId && produtoId
      ? {
          id_cliente: clienteId,
          numero,
          situacao: 'EM_ANDAMENTO',
          data_venda: today,
          ...(this.asId(categoria) ? { id_categoria: this.asId(categoria) } : {}),
          observacoes: 'ERP-ENERGY probe emissão NF (conta de teste)',
          itens: [
            {
              id: produtoId,
              descricao: 'Probe emissão NF',
              quantidade: 1,
              valor: produtoValor,
            },
          ],
          condicao_pagamento: {
            tipo_pagamento: 'SEM_PAGAMENTO',
            ...(this.asId(conta)
              ? { id_conta_financeira: this.asId(conta) }
              : {}),
            opcao_condicao_pagamento: 'À vista',
            parcelas: [
              {
                data_vencimento: today,
                valor: produtoValor,
                descricao: 'Parcela 1',
              },
            ],
          },
        }
      : null;

    const created = createBody
      ? await this.probeWrite('POST', '/v1/venda', createBody)
      : {
          id: 'create_venda',
          method: 'POST',
          path: '/v1/venda',
          ok: false,
          status: 0,
          error: 'Conta de teste sem cliente ou produto para montar o payload.',
          body: {
            hasCliente: Boolean(clienteId),
            hasProduto: Boolean(produtoId),
          },
        };

    const vendaId = this.asId(created.body);
    const vendaGet = vendaId
      ? await this.probeOne('venda_criada', `/v1/venda/${vendaId}`)
      : null;

    const emitBodies = vendaId
      ? [
          { id_venda: vendaId },
          { idVenda: vendaId },
          { venda_id: vendaId },
        ]
      : [{}];

    const emitPaths = vendaId
      ? [
          '/v1/notas-fiscais',
          '/v1/notas-fiscais-servico',
          '/v1/notas-fiscais/emitir',
          '/v1/notas-fiscais-servico/emitir',
          `/v1/venda/${vendaId}/emitir`,
          `/v1/venda/${vendaId}/nota-fiscal`,
          `/v1/venda/${vendaId}/nfe`,
          `/v1/venda/${vendaId}/nfse`,
          `/v1/venda/${vendaId}/emitir-nfe`,
          `/v1/venda/${vendaId}/emitir-nfse`,
          `/v1/venda/${vendaId}/rascunho-nfe`,
          '/v1/nfe',
          '/v1/nfse',
        ]
      : [
          '/v1/notas-fiscais',
          '/v1/notas-fiscais-servico',
          '/v1/notas-fiscais/emitir',
        ];

    const emissionAttempts = [];
    for (const path of emitPaths) {
      emissionAttempts.push(
        await this.probeWrite('POST', path, emitBodies[0]),
      );
    }

    let deleted: unknown = null;
    if (vendaId) {
      deleted = await this.probeWrite('POST', '/v1/venda/exclusao-lote', {
        ids: [vendaId],
      });
    }

    return {
      ambiente: 'teste',
      documented: CONTA_AZUL_DOCUMENTED_ENDPOINTS.emissaoNotaFiscal,
      probedAt: new Date().toISOString(),
      lookups: {
        pessoas: this.summarizeProbe(lookups.pessoas),
        produtos: this.summarizeProbe(lookups.produtos),
        contasFinanceiras: this.summarizeProbe(lookups.contasFinanceiras),
        categorias: this.summarizeProbe(lookups.categorias),
        proximoNumero: this.summarizeProbe(lookups.proximoNumero),
        vendedores: this.summarizeProbe(lookups.vendedores),
      },
      createVenda: {
        ...created,
        request: createBody,
      },
      vendaCriada: vendaGet,
      emissionAttempts: emissionAttempts.map((row) => ({
        method: row.method,
        path: row.path,
        ok: row.ok,
        status: row.status,
        error: row.error,
        body: this.truncate(row.body, 800),
      })),
      deleted,
      conclusion: {
        canCreateSale: Boolean(created.ok),
        canEmitInvoice: emissionAttempts.some((row) => row.ok),
      },
    };
  }

  /**
   * Protótipo: NFs da conta de teste vs ERP + trava de finalização.
   * Só reporta. Não grava nem altera produção.
   */
  async reconcileTestInvoices(days = 90) {
    const today = new Date();
    const dataFinal = this.ymd(today);
    const past = new Date(today);
    past.setUTCDate(past.getUTCDate() - Math.max(1, Math.min(365, days)));
    const dataInicial = this.ymd(past);

    const caNfs = await this.listAllNotas(dataInicial, dataFinal);
    const erp = await this.loadErpInvoices();
    const { gaps } = await this.financeiro.listFinalizeStockGaps(200);

    const report = reconcileContaAzulNfs({
      ca: caNfs,
      erp,
      finalizeGaps: gaps,
    });

    return {
      ambiente: 'teste',
      period: { dataInicial, dataFinal },
      contaAzul: {
        totalNfs: caNfs.length,
        sample: caNfs.slice(0, 8),
        camposPrimeiraNf: caNfs[0] ? Object.keys(caNfs[0]) : [],
      },
      erp: { totalNfs: erp.length },
      matched: report.matched,
      divergencias: report.divergencias,
    };
  }

  private async listAllNotas(
    dataInicial: string,
    dataFinal: string,
    onWindow?: () => void,
  ): Promise<CaNfResumo[]> {
    const out: CaNfResumo[] = [];
    for (const window of this.dateWindows(dataInicial, dataFinal, 15)) {
      try {
        out.push(
          ...(await this.listNotasWindow('/v1/notas-fiscais', {
            data_inicial: window.start,
            data_final: window.end,
          })),
        );
      } catch (err) {
        this.logger.warn(
          `NFe ${window.start}..${window.end}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      try {
        out.push(
          ...(await this.listNotasWindow('/v1/notas-fiscais-servico', {
            data_competencia_de: window.start,
            data_competencia_ate: window.end,
          })),
        );
      } catch (err) {
        this.logger.warn(
          `NFS-e ${window.start}..${window.end}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      onWindow?.();
    }
    return out;
  }

  private async listNotasWindow(
    path: string,
    dateParams: Record<string, string | number>,
  ): Promise<CaNfResumo[]> {
    const out: CaNfResumo[] = [];
    const pageSize = 50;
    let pagina = 1;
    while (pagina <= 200) {
      const payload = (await this.withRetry(
        `${path} p${pagina}`,
        () =>
          this.apiGet(path, {
            ...dateParams,
            pagina,
            tamanho_pagina: pageSize,
          }),
      )) as Record<string, unknown>;
      const itens = Array.isArray(payload.itens)
        ? payload.itens
        : Array.isArray(payload.items)
          ? payload.items
          : [];
      for (const raw of itens) {
        if (raw && typeof raw === 'object') {
          out.push(mapContaAzulNf(raw as Record<string, unknown>));
        }
      }
      if (itens.length < pageSize) break;
      pagina += 1;
    }
    return out;
  }

  private async listAllPessoas(): Promise<CaPessoa[]> {
    const out: CaPessoa[] = [];
    const pageSize = 50;
    let pagina = 1;
    while (pagina <= 200) {
      const payload = await this.withRetry(`pessoas p${pagina}`, () =>
        this.apiGet('/v1/pessoas', {
          pagina,
          tamanho_pagina: pageSize,
        }),
      );
      const itens = this.payloadItems(payload);
      for (const item of itens) {
        const mapped = mapContaAzulPessoa(item);
        if (mapped) out.push(mapped);
      }
      if (itens.length < pageSize) break;
      pagina += 1;
    }
    return out;
  }

  private pickPessoaForPedido(pessoas: CaPessoa[]): CaPessoa | null {
    if (pessoas.length === 0) return null;
    return pessoas.reduce((best, pessoa) => {
      const score = (p: CaPessoa) =>
        (p.ativo ? 4 : 0) +
        (p.perfis.includes('CLIENTE') ? 2 : 0) +
        (p.endereco ? 1 : 0);
      return score(pessoa) > score(best) ? pessoa : best;
    });
  }

  /**
   * Busca a pessoa na CA por CNPJ (`busca`) e completa o endereço no detalhe.
   */
  private async findPessoaByDocumento(
    digits: string,
    listAll: () => Promise<CaPessoa[]>,
  ): Promise<{
    pessoa: CaPessoa | null;
    detalheBuscado: boolean;
  }> {
    const matches: CaPessoa[] = [];
    try {
      const payload = await this.withRetry(`pessoas busca ${digits}`, () =>
        this.apiGet('/v1/pessoas', {
          pagina: 1,
          tamanho_pagina: 50,
          busca: digits,
        }),
      );
      for (const item of this.payloadItems(payload)) {
        const mapped = mapContaAzulPessoaParaPedido(item);
        if (mapped && mapped.documentoDigits === digits) matches.push(mapped);
      }
    } catch (err) {
      this.logger.warn(
        `GET /v1/pessoas?busca=: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    let pessoa = this.pickPessoaForPedido(matches);
    if (!pessoa) {
      const listed = await listAll();
      pessoa = this.pickPessoaForPedido(
        listed.filter((row) => row.documentoDigits === digits),
      );
    }
    if (!pessoa) return { pessoa: null, detalheBuscado: false };
    if (pessoa.endereco) return { pessoa, detalheBuscado: false };
    const pessoaId = pessoa.contaAzulId;
    try {
      const detail = await this.withRetry(
        `pessoa ${pessoaId}`,
        () => this.apiGet(`/v1/pessoas/${encodeURIComponent(pessoaId)}`),
      );
      const rec =
        detail && typeof detail === 'object' && !Array.isArray(detail)
          ? (detail as Record<string, unknown>)
          : null;
      const mapped = rec ? mapContaAzulPessoaParaPedido(rec) : null;
      if (mapped) pessoa = mapped;
      return { pessoa, detalheBuscado: true };
    } catch (err) {
      this.logger.warn(
        `GET /v1/pessoas/${pessoaId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { pessoa, detalheBuscado: true };
    }
  }

  private async enrichPessoasAddresses(
    pessoas: CaPessoa[],
    neededDigits: Set<string>,
  ): Promise<{ pessoas: CaPessoa[]; detalhesBuscados: number }> {
    const out = [...pessoas];
    let detalhesBuscados = 0;
    for (let i = 0; i < out.length; i += 1) {
      const pessoa = out[i];
      if (!neededDigits.has(pessoa.documentoDigits) || pessoa.endereco) {
        continue;
      }
      try {
        const detail = await this.withRetry(
          `pessoa ${pessoa.contaAzulId}`,
          () => this.apiGet(`/v1/pessoas/${encodeURIComponent(pessoa.contaAzulId)}`),
        );
        detalhesBuscados += 1;
        const rec =
          detail && typeof detail === 'object' && !Array.isArray(detail)
            ? (detail as Record<string, unknown>)
            : null;
        const mapped = rec ? mapContaAzulPessoa(rec) : null;
        if (mapped) {
          out[i] = {
            ...pessoa,
            ...mapped,
            documentoDigits: pessoa.documentoDigits,
          };
        }
      } catch (err) {
        this.logger.warn(
          `GET /v1/pessoas/${pessoa.contaAzulId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { pessoas: out, detalhesBuscados };
  }

  private async replacePessoas(pessoas: CaPessoa[]): Promise<number> {
    const now = new Date();
    let saved = 0;
    for (const p of pessoas) {
      const id = randomUUID();
      await this.prisma.client.$executeRaw`
        INSERT INTO "ContaAzulPessoa" (
          "id", "contaAzulId", "documento", "documentoDigits", "nome",
          "tipoPessoa", "perfis", "cep", "logradouro", "numero", "complemento",
          "bairro", "cidade", "uf", "enderecoJson", "ativo", "syncedAt",
          "createdAt", "updatedAt"
        ) VALUES (
          CAST(${id} AS UUID),
          ${p.contaAzulId},
          ${p.documento},
          ${p.documentoDigits},
          ${p.nome},
          ${p.tipoPessoa},
          ${p.perfis.join(',')},
          ${p.endereco?.cep ?? null},
          ${p.endereco?.logradouro ?? null},
          ${p.endereco?.numero ?? null},
          ${p.endereco?.complemento ?? null},
          ${p.endereco?.bairro ?? null},
          ${p.endereco?.cidade ?? null},
          ${p.endereco?.uf ?? null},
          ${p.enderecoJson},
          ${p.ativo},
          ${now},
          ${now},
          ${now}
        )
        ON CONFLICT ("contaAzulId") DO UPDATE SET
          "documento" = EXCLUDED."documento",
          "documentoDigits" = EXCLUDED."documentoDigits",
          "nome" = EXCLUDED."nome",
          "tipoPessoa" = EXCLUDED."tipoPessoa",
          "perfis" = EXCLUDED."perfis",
          "cep" = EXCLUDED."cep",
          "logradouro" = EXCLUDED."logradouro",
          "numero" = EXCLUDED."numero",
          "complemento" = EXCLUDED."complemento",
          "bairro" = EXCLUDED."bairro",
          "cidade" = EXCLUDED."cidade",
          "uf" = EXCLUDED."uf",
          "enderecoJson" = EXCLUDED."enderecoJson",
          "ativo" = EXCLUDED."ativo",
          "syncedAt" = EXCLUDED."syncedAt",
          "updatedAt" = EXCLUDED."updatedAt"
      `;
      saved += 1;
    }
    return saved;
  }

  private isPrismaUniqueError(err: unknown): boolean {
    return Boolean(
      err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code?: string }).code === 'P2002',
    );
  }

  private uniqueCarrierName(base: string, digits: string, taken: Set<string>): string {
    const tryName = (name: string) => {
      const key = name.trim().toLowerCase();
      if (!key || taken.has(key)) return null;
      taken.add(key);
      return name.trim();
    };
    return (
      tryName(base) ??
      tryName(`${base} (${digits})`) ??
      `${base} (${digits}-${randomUUID().slice(0, 8)})`
    );
  }

  private async applyErpCadastros(
    mutations: ErpCadastroMutation[],
    pedidos: PedidoCadastroPreview[],
    pessoas: CaPessoa[],
  ): Promise<{
    customersCreated: number;
    customersUpdated: number;
    suppliersCreated: number;
    suppliersUpdated: number;
    carriersCreated: number;
    carriersUpdated: number;
    pedidosVinculados: number;
  }> {
    const counts = {
      customersCreated: 0,
      customersUpdated: 0,
      suppliersCreated: 0,
      suppliersUpdated: 0,
      carriersCreated: 0,
      carriersUpdated: 0,
      pedidosVinculados: 0,
    };
    const customerIdByDigits = new Map<string, string>();
    const existingCustomers = await this.prisma.client.customer.findMany({
      select: { id: true, document: true, name: true },
    });
    for (const row of existingCustomers) {
      const digits = documentDigits(row.document);
      if (digits.length >= 11 && !customerIdByDigits.has(digits)) {
        customerIdByDigits.set(digits, row.id);
      }
    }
    const carrierNames = new Set(
      (
        await this.prisma.client.carrier.findMany({ select: { name: true } })
      ).map((row) => row.name.trim().toLowerCase()),
    );

    for (const mut of mutations) {
      const pessoa = mut.pessoa;
      const digits = pessoa.documentoDigits;
      if (mut.kind === 'CUSTOMER') {
        if (mut.action === 'create' && !mut.erpId) {
          const existingId = customerIdByDigits.get(digits);
          if (existingId) {
            await this.prisma.client.customer.update({
              where: { id: existingId },
              data: {
                name: pessoa.nome,
                document: pessoa.documento,
                ...(mut.address && pessoa.enderecoJson
                  ? { deliveryAddress: pessoa.enderecoJson }
                  : {}),
                isActive: pessoa.ativo,
              },
            });
            counts.customersUpdated += 1;
            continue;
          }
          const created = await this.prisma.client.customer.create({
            data: {
              name: pessoa.nome,
              document: pessoa.documento,
              deliveryAddress: pessoa.enderecoJson,
              isActive: pessoa.ativo,
            },
          });
          customerIdByDigits.set(digits, created.id);
          counts.customersCreated += 1;
          continue;
        }
        if (mut.action === 'update' && mut.erpId) {
          await this.prisma.client.customer.update({
            where: { id: mut.erpId },
            data: {
              ...(mut.name ? { name: pessoa.nome } : {}),
              document: pessoa.documento,
              ...(mut.address && pessoa.enderecoJson
                ? { deliveryAddress: pessoa.enderecoJson }
                : {}),
            },
          });
          customerIdByDigits.set(digits, mut.erpId);
          counts.customersUpdated += 1;
        }
        continue;
      }

      if (mut.kind === 'SUPPLIER') {
        if (mut.action === 'create' && !mut.erpId) {
          await this.prisma.client.supplier.create({
            data: {
              name: pessoa.nome,
              document: pessoa.documento,
              isActive: pessoa.ativo,
            },
          });
          counts.suppliersCreated += 1;
          continue;
        }
        if (mut.action === 'update' && mut.erpId) {
          await this.prisma.client.supplier.update({
            where: { id: mut.erpId },
            data: {
              ...(mut.name ? { name: pessoa.nome } : {}),
              document: pessoa.documento,
            },
          });
          counts.suppliersUpdated += 1;
        }
        continue;
      }

      if (mut.kind === 'CARRIER') {
        if (mut.action === 'create' && !mut.erpId) {
          const name = this.uniqueCarrierName(pessoa.nome, digits, carrierNames);
          try {
            const created = await this.prisma.client.carrier.create({
              data: {
                name,
                document: pessoa.documento,
                deliveryAddress: pessoa.enderecoJson,
                isActive: pessoa.ativo,
              },
            });
            counts.carriersCreated += 1;
            try {
              await this.prisma.client.carrierDocument.create({
                data: { carrierId: created.id, document: digits },
              });
            } catch (err) {
              if (!this.isPrismaUniqueError(err)) throw err;
            }
          } catch (err) {
            if (!this.isPrismaUniqueError(err)) throw err;
            this.logger.warn(
              `Transportadora ${pessoa.nome} (${digits}) não criada: nome duplicado.`,
            );
          }
          continue;
        }
        if (mut.action === 'update' && mut.erpId) {
          const data: {
            name?: string;
            document?: string | null;
            deliveryAddress?: string | null;
          } = {
            document: pessoa.documento,
            ...(mut.address && pessoa.enderecoJson
              ? { deliveryAddress: pessoa.enderecoJson }
              : {}),
          };
          if (mut.name) data.name = pessoa.nome;
          try {
            await this.prisma.client.carrier.update({
              where: { id: mut.erpId },
              data,
            });
          } catch (err) {
            if (!this.isPrismaUniqueError(err) || !mut.name) throw err;
            await this.prisma.client.carrier.update({
              where: { id: mut.erpId },
              data: { ...data, name: `${pessoa.nome} (${digits})` },
            });
          }
          counts.carriersUpdated += 1;
        }
      }
    }

    const pessoasByDigits = new Map(
      pessoas.map((p) => [p.documentoDigits, p] as const),
    );
    for (const pedido of pedidos) {
      const customerId =
        customerIdByDigits.get(pedido.cnpj) ?? pedido.targetCustomerId ?? null;
      if (!customerId) continue;
      const pessoa = pessoasByDigits.get(pedido.cnpj);
      const data: {
        customerId?: string;
        customerName?: string;
        deliveryAddress?: string;
      } = {};
      if (pedido.customerId !== customerId) data.customerId = customerId;
      if (pedido.name && pessoa) data.customerName = pessoa.nome;
      if (pedido.address && pessoa?.enderecoJson) {
        data.deliveryAddress = pessoa.enderecoJson;
      }
      if (!data.customerId && !data.customerName && !data.deliveryAddress) {
        continue;
      }
      await this.prisma.client.order.update({
        where: { id: pedido.orderId },
        data,
      });
      counts.pedidosVinculados += 1;
    }
    return counts;
  }

  private storageConfigured(): boolean {
    const bucket = this.config.get<string>('R2_BUCKET_NAME') ?? '';
    return Boolean(this.storage && bucket.trim());
  }

  private async assertNotRemessaForDownload(
    orderId: string,
    invoiceNumber: string,
  ): Promise<void> {
    const order = await this.prisma.client.order.findUnique({
      where: { id: orderId },
      select: { notaRemessa: true },
    });
    if (
      order &&
      invoiceNumberMatchesRemessa(invoiceNumber, order.notaRemessa)
    ) {
      throw new BadRequestException(
        'Nota de remessa não possui XML/DANFE nesta integração. Use a Nota de Venda.',
      );
    }
  }

  private async readStoredNotaArquivo(
    orderId: string,
    invoiceNumber: string,
    kind: 'xml' | 'danfe',
  ): Promise<{ buffer: Buffer; contentType: string; filename: string } | null> {
    if (!this.storageConfigured() || !this.storage) return null;
    const numero = nfNumberKey(invoiceNumber);
    if (!numero) return null;
    try {
      const rows = await this.prisma.client.$queryRaw<
        Array<{
          invoiceNumber: string;
          xmlStorageKey: string | null;
          danfeStorageKey: string | null;
        }>
      >`
        SELECT "invoiceNumber", "xmlStorageKey", "danfeStorageKey"
        FROM "OrderInvoiceHistory"
        WHERE "orderId" = CAST(${orderId} AS UUID)
      `;
      const row = rows.find((item) => nfNumberKey(item.invoiceNumber) === numero);
      const key = kind === 'danfe' ? row?.danfeStorageKey : row?.xmlStorageKey;
      if (!key) return null;
      const stored = await this.storage.getObjectBuffer(key);
      if (kind === 'danfe') {
        return {
          buffer: stored.buffer,
          contentType: 'application/pdf',
          filename: danfeDownloadFilename(numero),
        };
      }
      const detected = detectCaNfFile(stored.buffer);
      return {
        buffer: stored.buffer,
        contentType: 'application/octet-stream',
        filename: nfeDownloadFilename(numero, detected.ext),
      };
    } catch (err) {
      this.logger.warn(
        `Leitura XML/Nota persistido NF ${numero}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private async persistNotaArquivo(
    orderId: string,
    invoiceNumber: string,
    kind: 'xml' | 'danfe',
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    if (!this.storageConfigured() || !this.storage) return;
    const numero = nfNumberKey(invoiceNumber);
    if (!numero) return;
    const key = nfeStorageKey(orderId, numero, kind);
    try {
      await this.storage.upload(key, buffer, contentType);
      const rows = await this.prisma.client.$queryRaw<
        Array<{ id: string; invoiceNumber: string }>
      >`
        SELECT id, "invoiceNumber"
        FROM "OrderInvoiceHistory"
        WHERE "orderId" = CAST(${orderId} AS UUID)
      `;
      const existing = rows.find((row) => nfNumberKey(row.invoiceNumber) === numero);
      if (existing) {
        if (kind === 'danfe') {
          await this.prisma.client.$executeRaw`
            UPDATE "OrderInvoiceHistory"
            SET "danfeStorageKey" = ${key}
            WHERE id = ${existing.id}
          `;
        } else {
          await this.prisma.client.$executeRaw`
            UPDATE "OrderInvoiceHistory"
            SET "xmlStorageKey" = ${key}
            WHERE id = ${existing.id}
          `;
          await this.fillHistoryFromParsedXml(existing.id, buffer);
        }
        return;
      }
      const id = randomUUID();
      if (kind === 'danfe') {
        await this.prisma.client.$executeRaw`
          INSERT INTO "OrderInvoiceHistory" (
            id, "orderId", "invoiceNumber", "pickedQtyAtTime",
            "createdAt", "createdBy", "danfeStorageKey"
          ) VALUES (
            ${id},
            CAST(${orderId} AS UUID),
            ${numero},
            0,
            NOW(),
            'conta-azul-auto',
            ${key}
          )
        `;
      } else {
        const parsed = parseNfeXml(buffer.toString('utf8'));
        const volumes =
          parsed?.volumes != null && parsed.volumes >= 1 ? parsed.volumes : null;
        const invoiceValue =
          parsed && parsed.total > 0 ? parsed.total : null;
        const xmlDate =
          nfeEmitidaEmDate(parsed?.saiuEm) ?? nfeEmitidaEmDate(parsed?.emitidaEm);
        await this.prisma.client.$executeRaw`
          INSERT INTO "OrderInvoiceHistory" (
            id, "orderId", "invoiceNumber", "pickedQtyAtTime",
            "invoiceValue", "volumes", "createdAt", "createdBy", "xmlStorageKey"
          ) VALUES (
            ${id},
            CAST(${orderId} AS UUID),
            ${numero},
            0,
            ${invoiceValue},
            ${volumes},
            ${xmlDate ?? new Date()},
            'conta-azul-auto',
            ${key}
          )
        `;
      }
    } catch (err) {
      this.logger.warn(
        `Persistência XML/Nota NF ${numero}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async fillHistoryFromParsedXml(
    historyId: string,
    buffer: Buffer,
  ): Promise<void> {
    const parsed = parseNfeXml(buffer.toString('utf8'));
    if (!parsed) return;
    const volumes =
      parsed.volumes != null && parsed.volumes >= 1 ? parsed.volumes : null;
    const invoiceValue = parsed.total > 0 ? parsed.total : null;
    if (volumes == null && invoiceValue == null) return;
    try {
      await this.prisma.client.$executeRaw`
        UPDATE "OrderInvoiceHistory"
        SET
          "volumes" = COALESCE("volumes", ${volumes}),
          "invoiceValue" = COALESCE("invoiceValue", ${invoiceValue})
        WHERE id = ${historyId}
      `;
    } catch (err) {
      this.logger.warn(
        `Falha ao preencher volumes/valor da NF a partir do XML: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async listPendingNotaArquivos(
    limit: number,
  ): Promise<Array<{ orderId: string; invoiceNumber: string }>> {
    try {
      const candidates = await this.prisma.client.$queryRaw<
        Array<{
          orderId: string;
          invoiceNumber: string;
          notaRemessa: string | null;
        }>
      >`
        SELECT o.id::text AS "orderId",
               o."invoiceNumber" AS "invoiceNumber",
               o."notaRemessa" AS "notaRemessa"
        FROM "Order" o
        WHERE o."invoiceNumber" IS NOT NULL AND btrim(o."invoiceNumber") <> ''
        UNION
        SELECT h."orderId"::text, h."invoiceNumber", o."notaRemessa"
        FROM "OrderInvoiceHistory" h
        JOIN "Order" o ON o.id = h."orderId"
        WHERE h."invoiceNumber" IS NOT NULL AND btrim(h."invoiceNumber") <> ''
      `;
      const stored = await this.prisma.client.$queryRaw<
        Array<{
          orderId: string;
          invoiceNumber: string;
          xmlStorageKey: string | null;
          danfeStorageKey: string | null;
        }>
      >`
        SELECT "orderId"::text AS "orderId",
               "invoiceNumber",
               "xmlStorageKey",
               "danfeStorageKey"
        FROM "OrderInvoiceHistory"
      `;
      const complete = new Set<string>();
      for (const row of stored) {
        if (!row.xmlStorageKey?.trim() || !row.danfeStorageKey?.trim()) continue;
        for (const n of invoiceNumberDigitList(row.invoiceNumber)) {
          complete.add(`${row.orderId}:${n}`);
        }
      }
      const seen = new Set<string>();
      const out: Array<{ orderId: string; invoiceNumber: string }> = [];
      for (const row of candidates) {
        if (out.length >= limit) break;
        for (const numero of invoiceNumberDigitList(row.invoiceNumber)) {
          if (invoiceNumberMatchesRemessa(numero, row.notaRemessa)) continue;
          const k = `${row.orderId}:${numero}`;
          if (seen.has(k) || complete.has(k)) continue;
          seen.add(k);
          out.push({ orderId: row.orderId, invoiceNumber: numero });
          if (out.length >= limit) break;
        }
      }
      return out;
    } catch (err) {
      this.logger.warn(
        `Lista XML/Nota pendente: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  private async listCatalogo(
    path: string,
    mapFn: (item: Record<string, unknown>) => CaCatalogoItem | null,
    extraParams?: Record<string, string | number | boolean>,
  ): Promise<CaCatalogoItem[]> {
    const out: CaCatalogoItem[] = [];
    const pageSize = 50;
    let pagina = 1;
    while (pagina <= 200) {
      const payload = await this.withRetry(`${path} p${pagina}`, () =>
        this.apiGet(path, {
          pagina,
          tamanho_pagina: pageSize,
          ...extraParams,
        }),
      );
      const itens = this.payloadItems(payload);
      for (const item of itens) {
        const mapped = mapFn(item);
        if (mapped) out.push(mapped);
      }
      if (itens.length < pageSize) break;
      pagina += 1;
    }
    return out;
  }

  private async replaceCatalogo(
    table: 'ContaAzulCategoria' | 'ContaAzulCentroCusto',
    items: CaCatalogoItem[],
  ): Promise<number> {
    const now = new Date();
    let saved = 0;
    for (const item of items) {
      const id = randomUUID();
      if (table === 'ContaAzulCategoria') {
        await this.prisma.client.$executeRaw`
          INSERT INTO "ContaAzulCategoria" (
            "id", "contaAzulId", "nome", "paiId", "ativo",
            "syncedAt", "createdAt", "updatedAt"
          ) VALUES (
            CAST(${id} AS UUID),
            ${item.contaAzulId},
            ${item.nome},
            ${item.paiId},
            ${item.ativo},
            ${now},
            ${now},
            ${now}
          )
          ON CONFLICT ("contaAzulId") DO UPDATE SET
            "nome" = EXCLUDED."nome",
            "paiId" = EXCLUDED."paiId",
            "ativo" = EXCLUDED."ativo",
            "syncedAt" = EXCLUDED."syncedAt",
            "updatedAt" = EXCLUDED."updatedAt"
        `;
      } else {
        await this.prisma.client.$executeRaw`
          INSERT INTO "ContaAzulCentroCusto" (
            "id", "contaAzulId", "codigo", "nome", "ativo",
            "syncedAt", "createdAt", "updatedAt"
          ) VALUES (
            CAST(${id} AS UUID),
            ${item.contaAzulId},
            ${item.codigo},
            ${item.nome},
            ${item.ativo},
            ${now},
            ${now},
            ${now}
          )
          ON CONFLICT ("contaAzulId") DO UPDATE SET
            "codigo" = EXCLUDED."codigo",
            "nome" = EXCLUDED."nome",
            "ativo" = EXCLUDED."ativo",
            "syncedAt" = EXCLUDED."syncedAt",
            "updatedAt" = EXCLUDED."updatedAt"
        `;
      }
      saved += 1;
    }
    return saved;
  }

  private async listAllVendas(
    dataInicial: string,
    dataFinal: string,
  ): Promise<CaVenda[]> {
    const out: CaVenda[] = [];
    const pageSize = 50;
    for (const window of this.dateWindows(dataInicial, dataFinal, 90)) {
      let pagina = 1;
      while (pagina <= 200) {
        try {
          const payload = await this.withRetry(
            `vendas ${window.start} p${pagina}`,
            () =>
              this.apiGet('/v1/venda/busca', {
                pagina,
                tamanho_pagina: pageSize,
                data_inicio: window.start,
                data_fim: window.end,
              }),
          );
          const itens = this.payloadItems(payload);
          for (const item of itens) {
            const mapped = mapContaAzulVenda(item);
            if (mapped) out.push(mapped);
          }
          if (itens.length < pageSize) break;
          pagina += 1;
        } catch (err) {
          this.logger.warn(
            `vendas ${window.start}..${window.end} p${pagina}: ${err instanceof Error ? err.message : String(err)}`,
          );
          break;
        }
      }
    }
    return out;
  }

  private dateWindows(
    startYmd: string,
    endYmd: string,
    maxDays: number,
  ): Array<{ start: string; end: string }> {
    const windows: Array<{ start: string; end: string }> = [];
    let cursor = new Date(`${startYmd}T12:00:00.000Z`);
    const end = new Date(`${endYmd}T12:00:00.000Z`);
    while (cursor <= end) {
      const chunkEnd = new Date(cursor);
      chunkEnd.setUTCDate(chunkEnd.getUTCDate() + (maxDays - 1));
      const last = chunkEnd < end ? chunkEnd : end;
      windows.push({ start: this.ymd(cursor), end: this.ymd(last) });
      cursor = new Date(last);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return windows;
  }

  private payloadItems(payload: unknown): Record<string, unknown>[] {
    if (!payload || typeof payload !== 'object') return [];
    const rec = payload as Record<string, unknown>;
    const list = rec.itens ?? rec.items ?? rec.data;
    if (!Array.isArray(list)) return [];
    return list.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    );
  }

  private async listFinanceiroTitulos(
    path: string,
    dataInicial: string,
    dataFinal: string,
    origem: 'receber' | 'pagar',
    onWindow?: () => void,
  ): Promise<CaTitulo[]> {
    const out: CaTitulo[] = [];
    const mapFn = origem === 'receber' ? mapContaAzulReceber : mapContaAzulPagar;
    for (const window of this.dateWindows(dataInicial, dataFinal, 31)) {
      let pagina = 1;
      while (pagina <= 200) {
        try {
          const payload = await this.withRetry(
            `${origem} ${window.start} p${pagina}`,
            () =>
              this.apiGet(path, {
                pagina,
                tamanho_pagina: 10,
                data_vencimento_de: window.start,
                data_vencimento_ate: window.end,
              }),
          );
          const itens = this.payloadItems(payload);
          for (const item of itens) {
            const mapped = mapFn(item);
            if (mapped) out.push(mapped);
          }
          if (itens.length < 10) break;
          pagina += 1;
        } catch (err) {
          this.logger.warn(
            `${origem} ${window.start}..${window.end} p${pagina}: ${err instanceof Error ? err.message : String(err)}`,
          );
          break;
        }
      }
      onWindow?.();
    }
    return out;
  }

  private async replaceTitulos(titulos: CaTitulo[]): Promise<void> {
    await this.prisma.client.$executeRaw`DELETE FROM "ContaAzulTitulo"`;
    const now = new Date();
    for (const t of titulos) {
      const id = randomUUID();
      await this.prisma.client.$executeRaw`
        INSERT INTO "ContaAzulTitulo" (
          "id", "contaAzulId", "tipo", "origem", "numero", "descricao",
          "contraParte", "documento", "valor", "valorPago", "valorAberto",
          "vencimento", "competencia", "status", "pago", "categoria",
          "centroCusto", "syncedAt",
          "createdAt", "updatedAt"
        ) VALUES (
          CAST(${id} AS UUID),
          ${t.contaAzulId},
          ${t.tipo},
          ${t.origem},
          ${t.numero},
          ${t.descricao},
          ${t.contraParte},
          ${t.documento},
          ${t.valor},
          ${t.valorPago},
          ${t.valorAberto},
          ${t.vencimento},
          ${t.competencia},
          ${t.status},
          ${t.pago},
          ${t.categoria},
          ${t.centroCusto},
          ${now},
          ${now},
          ${now}
        )
      `;
    }
  }

  private async applyFinanceiroFromCa(
    nfs: CaNfResumo[],
    receber: CaTitulo[],
  ): Promise<number> {
    const byDigits = new Map<string, { pago: boolean; valor: number | null; status: string }>();
    for (const nf of nfs) {
      if (!nf.numeroDigits) continue;
      byDigits.set(nf.numeroDigits, {
        pago: String(nf.status ?? '').toUpperCase().includes('CANCEL'),
        valor: nf.valor,
        status: nf.status ?? 'EMITIDA',
      });
    }
    for (const t of receber) {
      const digits = invoiceDigits(t.numero ?? t.descricao);
      if (!digits) continue;
      const prev = byDigits.get(digits);
      byDigits.set(digits, {
        pago: t.pago,
        valor: t.valorAberto || t.valor || prev?.valor || null,
        status: t.status,
      });
    }
    if (byDigits.size === 0) return 0;

    const rows = await this.prisma.client.financeiroNF.findMany({
      select: {
        id: true,
        invoiceNumber: true,
        valor: true,
        dataPagamento: true,
        status: true,
      },
    });

    let updated = 0;
    const today = new Date();
    for (const nf of rows) {
      const digits = invoiceDigits(nf.invoiceNumber);
      const ca = digits ? byDigits.get(digits) : undefined;
      if (!ca) continue;
      const pago = ca.pago;
      const nextStatus = pago
        ? 'PAGO'
        : String(ca.status).includes('ATRAS')
          ? 'ATRASADO'
          : 'ABERTO';
      const nextValor = ca.valor != null && ca.valor > 0 ? ca.valor : Number(nf.valor);
      const nextPagamento = pago ? nf.dataPagamento ?? today : null;
      if (
        nf.status === nextStatus &&
        Number(nf.valor) === nextValor &&
        Boolean(nf.dataPagamento) === Boolean(nextPagamento)
      ) {
        continue;
      }
      await this.prisma.client.financeiroNF.update({
        where: { id: nf.id },
        data: {
          status: nextStatus,
          valor: nextValor,
          dataPagamento: nextPagamento,
        },
      });
      updated += 1;
    }
    return updated;
  }

  private async loadErpFallbackTitulos(
    start: Date,
    end: Date,
  ): Promise<CaTitulo[]> {
    const out: CaTitulo[] = [];
    try {
      const [payables, receivables, despesas] = await Promise.all([
        this.prisma.client.accountPayable.findMany({
          where: { dueDate: { gte: start, lte: end } },
          include: { supplier: { select: { name: true } } },
        }),
        this.prisma.client.accountReceivable.findMany({
          where: { dueDate: { gte: start, lte: end } },
          include: { customer: { select: { name: true } } },
        }),
        this.prisma.client.despesa.findMany({
          where: { data: { gte: start, lte: end } },
        }),
      ]);
      for (const p of payables) {
        const pago = p.status === 'PAID' || Boolean(p.paidAt);
        out.push({
          contaAzulId: p.id,
          tipo: 'PAGAR',
          origem: 'pagar',
          numero: null,
          descricao: p.description,
          contraParte: p.supplier.name,
          documento: null,
          valor: Number(p.amount),
          valorPago: pago ? Number(p.amount) : 0,
          valorAberto: pago ? 0 : Number(p.amount),
          vencimento: p.dueDate,
          competencia: null,
          status: String(p.status),
          pago,
        });
      }
      for (const r of receivables) {
        const pago = r.status === 'PAID' || Boolean(r.receivedAt);
        out.push({
          contaAzulId: r.id,
          tipo: 'RECEBER',
          origem: 'receber',
          numero: null,
          descricao: r.description,
          contraParte: r.customer.name,
          documento: null,
          valor: Number(r.amount),
          valorPago: pago ? Number(r.amount) : 0,
          valorAberto: pago ? 0 : Number(r.amount),
          vencimento: r.dueDate,
          competencia: null,
          status: String(r.status),
          pago,
        });
      }
      for (const d of despesas) {
        out.push({
          contaAzulId: d.id,
          tipo: 'PAGAR',
          origem: 'pagar',
          numero: null,
          descricao: d.descricao,
          contraParte: d.fornecedor,
          documento: null,
          valor: Number(d.valor),
          valorPago: 0,
          valorAberto: Number(d.valor),
          vencimento: d.data,
          competencia: d.data,
          status: 'EM_ABERTO',
          pago: false,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Fallback ERP do calendário: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return out;
  }

  private async loadSyncMeta(): Promise<{
    lastSyncAt: Date | null;
    lastSyncError: string | null;
  }> {
    try {
      const rows = await this.prisma.client.$queryRaw<
        Array<{ lastSyncAt: Date | null; lastSyncError: string | null }>
      >`
        SELECT "lastSyncAt", "lastSyncError"
        FROM "ContaAzulSession"
        WHERE "id" = ${CONTA_AZUL_SESSION_ID}
        LIMIT 1
      `;
      return {
        lastSyncAt: rows[0]?.lastSyncAt ? new Date(rows[0].lastSyncAt) : null,
        lastSyncError: rows[0]?.lastSyncError ?? null,
      };
    } catch {
      return { lastSyncAt: null, lastSyncError: null };
    }
  }

  private async persistSyncMeta(
    lastSyncAt: Date | null,
    lastSyncError: string | null,
    clearSyncAt = false,
  ): Promise<void> {
    try {
      if (clearSyncAt) {
        await this.prisma.client.$executeRaw`
          UPDATE "ContaAzulSession"
          SET "lastSyncAt" = NULL,
              "lastSyncError" = ${lastSyncError},
              "updatedAt" = NOW()
          WHERE "id" = ${CONTA_AZUL_SESSION_ID}
        `;
        return;
      }
      if (lastSyncAt) {
        await this.prisma.client.$executeRaw`
          UPDATE "ContaAzulSession"
          SET "lastSyncAt" = ${lastSyncAt},
              "lastSyncError" = ${lastSyncError},
              "updatedAt" = NOW()
          WHERE "id" = ${CONTA_AZUL_SESSION_ID}
        `;
        return;
      }
      await this.prisma.client.$executeRaw`
        UPDATE "ContaAzulSession"
        SET "lastSyncError" = ${lastSyncError},
            "updatedAt" = NOW()
        WHERE "id" = ${CONTA_AZUL_SESSION_ID}
      `;
    } catch (err) {
      this.logger.warn(
        `Falha ao gravar lastSyncAt: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async loadErpInvoices(): Promise<ErpNfResumo[]> {
    const orders = await this.prisma.client.order.findMany({
      where: {
        AND: [
          { invoiceNumber: { not: null } },
          { NOT: { invoiceNumber: '' } },
        ],
        status: { not: OrderStatus.CANCELADO },
      },
      select: {
        id: true,
        code: true,
        externalOrderNumber: true,
        invoiceNumber: true,
        status: true,
        financeiroNF: { select: { valor: true } },
        exits: { select: { invoiceNumber: true, invoiceValue: true } },
      },
      take: 3000,
    });

    const rows: ErpNfResumo[] = [];
    for (const o of orders) {
      const numbers = new Set<string>();
      if (o.invoiceNumber?.trim()) numbers.add(o.invoiceNumber.trim());
      for (const ex of o.exits) {
        if (ex.invoiceNumber?.trim()) numbers.add(ex.invoiceNumber.trim());
      }
      for (const invoiceNumber of numbers) {
        const exit = o.exits.find(
          (e) => e.invoiceNumber.trim() === invoiceNumber,
        );
        rows.push({
          orderId: o.id,
          pedido: o.externalOrderNumber ?? o.code,
          invoiceNumber,
          invoiceDigits: invoiceDigits(invoiceNumber),
          status: o.status,
          invoiceValue: exit
            ? Number(exit.invoiceValue)
            : o.financeiroNF
              ? Number(o.financeiroNF.valor)
              : null,
        });
      }
    }
    return rows;
  }

  private async probeOne(
    id: string,
    path: string,
    params?: Record<string, string | number | boolean>,
  ) {
    try {
      const payload = await this.apiGet(path, params);
      const first = firstArrayItem(payload);
      return {
        id,
        path,
        ok: true,
        status: 200,
        topLevelKeys: objectKeys(payload),
        firstItemKeys: objectKeys(first),
        firstItem: first,
        sample: this.truncate(payload),
      };
    } catch (err) {
      const ax = err as AxiosError;
      return {
        id,
        path,
        ok: false,
        status: ax.response?.status ?? 0,
        error: this.axiosMessage(ax),
        body: this.truncate(ax.response?.data),
        firstItem: null,
        sample: null,
      };
    }
  }

  private async findSyncedTituloByInvoice(
    numero: string,
  ): Promise<CaTitulo | null> {
    const pattern = invoiceDescricaoMatchPattern(numero);
    if (!pattern) return null;
    try {
      const rows = await this.prisma.client.$queryRaw<StoredTituloRow[]>`
        SELECT * FROM "ContaAzulTitulo"
        WHERE "tipo" = 'RECEBER'
          AND (
            regexp_replace(
              regexp_replace(COALESCE("numero", ''), '[^0-9]', '', 'g'),
              '^0+',
              ''
            ) = ${numero}
            OR "descricao" ~* ${pattern}
          )
        LIMIT 50
      `;
      return (
        rows.map(rowToTitulo).find((t) => tituloMatchesInvoiceNumber(t, numero)) ??
        null
      );
    } catch (err) {
      this.logger.warn(
        `Busca de título por NF falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private async resolveChaveAcesso(
    numero: string,
    around: Date,
    opts?: { deep?: boolean },
  ): Promise<string | null> {
    const nota = Number(numero);
    for (const window of this.nfeLookupWindows(around, opts?.deep === true)) {
      const payload = (await this.apiGet('/v1/notas-fiscais', {
        pagina: 1,
        tamanho_pagina: 50,
        numero_nota: Number.isFinite(nota) ? nota : numero,
        data_inicial: window.start,
        data_final: window.end,
      })) as Record<string, unknown>;
      const itens = Array.isArray(payload.itens)
        ? payload.itens
        : Array.isArray(payload.items)
          ? payload.items
          : [];
      for (const raw of itens) {
        if (!raw || typeof raw !== 'object') continue;
        const item = raw as Record<string, unknown>;
        const rawNumero = item.numero_nota ?? item.numero;
        const itemNumero =
          typeof rawNumero === 'string' || typeof rawNumero === 'number'
            ? rawNumero
            : null;
        if (nfNumberKey(itemNumero) !== numero) continue;
        const chave = String(item.chave_acesso ?? '').replace(/\D/g, '');
        if (chave.length === 44) return chave;
      }
    }
    return null;
  }

  /**
   * Data-âncora para a listagem da CA (máx. 15 dias). Não exige título
   * financeiro nem contaAzulVendaId — notas pré-ERP usam a data do pedido
   * e janelas mais largas.
   */
  private async resolveNfLookupContext(
    numero: string,
    orderId?: string,
  ): Promise<{ around: Date; deep: boolean; chave: string | null }> {
    const titulo = await this.findSyncedTituloByInvoice(numero);
    if (titulo) {
      return {
        around: titulo.competencia ?? titulo.vencimento,
        deep: false,
        chave: null,
      };
    }

    let around: Date | null = null;
    let vendaId: string | null = null;
    if (orderId) {
      const order = await this.prisma.client.order.findUnique({
        where: { id: orderId },
        select: {
          invoicedAt: true,
          orderDate: true,
          createdAt: true,
          contaAzulVendaId: true,
        },
      });
      around = order?.invoicedAt ?? order?.orderDate ?? order?.createdAt ?? null;
      vendaId = order?.contaAzulVendaId?.trim() || null;
    } else {
      const histories = await this.prisma.client.orderInvoiceHistory.findMany({
        where: { invoiceNumber: { contains: numero } },
        take: 40,
        select: {
          invoiceNumber: true,
          createdAt: true,
          order: {
            select: {
              invoicedAt: true,
              orderDate: true,
              createdAt: true,
              contaAzulVendaId: true,
            },
          },
        },
      });
      const match = histories.find((row) => nfNumberKey(row.invoiceNumber) === numero);
      if (match) {
        around =
          match.order.invoicedAt ??
          match.order.orderDate ??
          match.order.createdAt ??
          match.createdAt;
        vendaId = match.order.contaAzulVendaId?.trim() || null;
      }
    }

    let chave: string | null = null;
    if (vendaId && around) {
      const notas = await this.listNotasByVendaId(vendaId, around);
      const hit = notas.find((nf) => nfNumberKey(nf.numero) === numero);
      if (hit?.chaveAcesso) chave = hit.chaveAcesso.replace(/\D/g, '');
    }

    return {
      around: around ?? new Date(),
      deep: true,
      chave: chave && chave.length === 44 ? chave : null,
    };
  }

  /** Janela de 15 dias centrada na competência; `deep` cobre até ~2 anos (notas pré-ERP). */
  private nfeLookupWindows(
    around: Date,
    deep = false,
  ): Array<{ start: string; end: string }> {
    const center = new Date(
      Date.UTC(
        around.getUTCFullYear(),
        around.getUTCMonth(),
        around.getUTCDate(),
        12,
        0,
        0,
        0,
      ),
    );
    const shifts = deep
      ? [0, -15, 15, -45, 45, -90, 90, -180, 180, -365, 365, -540, 540, -730, 730]
      : [0, -15, 15, -45, 45, -90, 90];
    const windows: Array<{ start: string; end: string }> = [];
    for (const shiftDays of shifts) {
      const mid = new Date(center);
      mid.setUTCDate(mid.getUTCDate() + shiftDays);
      const start = new Date(mid);
      start.setUTCDate(start.getUTCDate() - 7);
      const end = new Date(mid);
      end.setUTCDate(end.getUTCDate() + 7);
      windows.push({ start: this.ymd(start), end: this.ymd(end) });
    }
    return windows;
  }

  private async apiGet(
    path: string,
    params?: Record<string, string | number | boolean>,
  ): Promise<unknown> {
    const token = await this.getValidAccessToken();
    try {
      return await this.rawGet(path, token, params);
    } catch (err) {
      const ax = err as AxiosError;
      if (ax.response?.status !== 401) throw err;
      const refreshed = await this.refreshStoredToken({
        force: true,
        rejectAccessToken: token,
      });
      return this.rawGet(path, refreshed.accessToken, params);
    }
  }

  private async rawGet(
    path: string,
    accessToken: string,
    params?: Record<string, string | number | boolean>,
  ): Promise<unknown> {
    const url = `${CONTA_AZUL_API_BASE}${path}`;
    const res = await axios.get(url, {
      params,
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 30_000,
      validateStatus: (s) => s >= 200 && s < 300,
    });
    return res.data;
  }

  private async apiGetBuffer(path: string): Promise<Buffer> {
    const token = await this.getValidAccessToken();
    try {
      return await this.rawGetBuffer(path, token);
    } catch (err) {
      const ax = err as AxiosError;
      if (ax.response?.status !== 401) throw err;
      const refreshed = await this.refreshStoredToken({
        force: true,
        rejectAccessToken: token,
      });
      return this.rawGetBuffer(path, refreshed.accessToken);
    }
  }

  private async rawGetBuffer(path: string, accessToken: string): Promise<Buffer> {
    const url = `${CONTA_AZUL_API_BASE}${path}`;
    const res = await axios.get<ArrayBuffer>(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 45_000,
      responseType: 'arraybuffer',
      validateStatus: (s) => s >= 200 && s < 300,
    });
    return Buffer.from(res.data);
  }

  private async probeWrite(
    method: 'POST' | 'PUT',
    path: string,
    body: unknown,
  ) {
    try {
      const payload = await this.apiSend(method, path, body);
      return {
        id: `${method} ${path}`,
        method,
        path,
        ok: true,
        status: 200,
        body: this.truncate(payload),
        sample: payload,
        error: undefined as string | undefined,
      };
    } catch (err) {
      const ax = err as AxiosError;
      return {
        id: `${method} ${path}`,
        method,
        path,
        ok: false,
        status: ax.response?.status ?? 0,
        error: this.axiosMessage(ax),
        body: this.truncate(ax.response?.data),
        sample: ax.response?.data,
      };
    }
  }

  private async apiSend(
    method: 'POST' | 'PUT',
    path: string,
    body: unknown,
  ): Promise<unknown> {
    const token = await this.getValidAccessToken();
    try {
      return await this.rawSend(method, path, token, body);
    } catch (err) {
      const ax = err as AxiosError;
      if (ax.response?.status !== 401) throw err;
      const refreshed = await this.refreshStoredToken({
        force: true,
        rejectAccessToken: token,
      });
      return this.rawSend(method, path, refreshed.accessToken, body);
    }
  }

  private async rawSend(
    method: 'POST' | 'PUT',
    path: string,
    accessToken: string,
    body: unknown,
  ): Promise<unknown> {
    const url = `${CONTA_AZUL_API_BASE}${path}`;
    const res = await axios.request({
      method,
      url,
      data: body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
      validateStatus: (s) => s >= 200 && s < 300,
    });
    return res.data;
  }

  private summarizeProbe(row: {
    ok: boolean;
    status: number;
    path: string;
    firstItemKeys?: string[];
    error?: string;
  }) {
    return {
      path: row.path,
      ok: row.ok,
      status: row.status,
      firstItemKeys: row.firstItemKeys ?? [],
      error: row.error,
    };
  }

  private asId(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null;
    const rec = value as Record<string, unknown>;
    for (const key of ['id', 'uuid', 'id_venda']) {
      const v = rec[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  }

  private asNumber(value: unknown, fallback: number): number {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  private async getValidAccessToken(): Promise<string> {
    const session = await this.loadSession();
    if (!session) {
      throw new BadRequestException(
        'Conta Azul não conectada. Abra /api/financeiro/conta-azul/auth-url, autorize com o usuário de teste e envie o code em POST /connect.',
      );
    }
    if (!isAccessTokenExpired(session.expiresAt)) {
      return session.accessToken;
    }
    const refreshed = await this.refreshStoredToken();
    return refreshed.accessToken;
  }

  private async refreshStoredToken(opts?: {
    force?: boolean;
    rejectAccessToken?: string;
  }): Promise<StoredSession> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.doRefreshStoredToken(opts).finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private canReuseAccess(
    session: StoredSession,
    opts?: { force?: boolean; rejectAccessToken?: string },
  ): boolean {
    if (
      opts?.force &&
      opts.rejectAccessToken &&
      session.accessToken === opts.rejectAccessToken
    ) {
      return false;
    }
    return !isAccessTokenExpired(session.expiresAt);
  }

  private async doRefreshStoredToken(opts?: {
    force?: boolean;
    rejectAccessToken?: string;
  }): Promise<StoredSession> {
    const deadline = Date.now() + 20_000;
    let locked = false;
    while (Date.now() < deadline) {
      const waiting = await this.loadSession();
      if (!waiting?.refreshToken) {
        throw new BadRequestException(
          'Sem refresh_token. Refaça o fluxo OAuth da Conta Azul.',
        );
      }
      if (this.canReuseAccess(waiting, opts)) {
        return waiting;
      }
      locked = await this.tryAcquireRefreshLock();
      if (locked) break;
      await this.sleep(150);
    }
    if (!locked) {
      const fallback = await this.loadSession();
      if (fallback && this.canReuseAccess(fallback, opts)) return fallback;
      throw new ServiceUnavailableException(
        'Timeout ao renovar token da Conta Azul (outra renovação em andamento). Tente de novo.',
      );
    }
    try {
      return await this.refreshWhileHoldingLock(opts);
    } finally {
      await this.releaseRefreshLock();
    }
  }

  private async refreshWhileHoldingLock(opts?: {
    force?: boolean;
    rejectAccessToken?: string;
  }): Promise<StoredSession> {
    const session = await this.loadSession();
    if (!session?.refreshToken) {
      throw new BadRequestException(
        'Sem refresh_token. Refaça o fluxo OAuth da Conta Azul.',
      );
    }
    if (this.canReuseAccess(session, opts)) {
      return session;
    }
    const usedRefresh = session.refreshToken;
    try {
      const tokens = await this.refreshViaOauthThenCognito(usedRefresh);
      return await this.persistSession(tokens, usedRefresh);
    } catch (err) {
      if (!isContaAzulInvalidGrant(err)) throw err;
      return this.recoverAfterInvalidGrant(usedRefresh);
    }
  }

  private async recoverAfterInvalidGrant(
    usedRefreshToken: string,
  ): Promise<StoredSession> {
    const loaded = await this.loadSession();
    const action = decideAfterInvalidGrant({
      usedRefreshToken,
      loaded,
    });
    if (action === 'use_session' && loaded) {
      this.logger.warn(
        'Refresh retornou invalid_grant, mas o banco já tem access_token válido (outra instância renovou). Usando o token persistido.',
      );
      return loaded;
    }
    if (action === 'retry_refresh' && loaded) {
      this.logger.warn(
        'Refresh retornou invalid_grant no token antigo; o banco já tem refresh_token novo. Tentando de novo uma vez.',
      );
      try {
        const tokens = await this.refreshViaOauthThenCognito(
          loaded.refreshToken,
        );
        return await this.persistSession(tokens, loaded.refreshToken);
      } catch (retryErr) {
        if (!isContaAzulInvalidGrant(retryErr)) throw retryErr;
      }
    }
    this.logger.error(CONTA_AZUL_REAUTH_MESSAGE);
    throw new BadRequestException(CONTA_AZUL_REAUTH_MESSAGE);
  }

  private async refreshViaOauthThenCognito(
    refreshToken: string,
  ): Promise<ContaAzulTokenResponse> {
    try {
      return await this.postToken(
        { grant_type: 'refresh_token', refresh_token: refreshToken },
        [CONTA_AZUL_API_TOKEN, CONTA_AZUL_AUTH_TOKEN],
      );
    } catch (oauthErr) {
      if (isContaAzulInvalidGrant(oauthErr)) throw oauthErr;
      if (!this.testUser()) throw oauthErr;
      this.logger.warn(
        `Refresh OAuth falhou, tentando Cognito: ${oauthErr instanceof Error ? oauthErr.message : String(oauthErr)}`,
      );
      try {
        return await this.cognitoRefresh(refreshToken);
      } catch (cognitoErr) {
        this.logger.warn(
          `Refresh Cognito falhou: ${cognitoErr instanceof Error ? cognitoErr.message : String(cognitoErr)}`,
        );
        throw oauthErr;
      }
    }
  }

  private async tryAcquireRefreshLock(): Promise<boolean> {
    if (!this.refreshLockColumnAvailable) return true;
    try {
      const n = await this.prisma.client.$executeRaw`
        UPDATE "ContaAzulSession"
        SET "refreshLockUntil" = NOW() + INTERVAL '45 seconds',
            "updatedAt" = NOW()
        WHERE "id" = ${CONTA_AZUL_SESSION_ID}
          AND ("refreshLockUntil" IS NULL OR "refreshLockUntil" < NOW())
      `;
      return Number(n) > 0;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/refreshLockUntil|does not exist/i.test(msg)) {
        this.refreshLockColumnAvailable = false;
        this.logger.warn(
          'Coluna refreshLockUntil ausente; lock só em memória neste processo.',
        );
        return true;
      }
      throw err;
    }
  }

  private async releaseRefreshLock(): Promise<void> {
    if (!this.refreshLockColumnAvailable) return;
    try {
      await this.prisma.client.$executeRaw`
        UPDATE "ContaAzulSession"
        SET "refreshLockUntil" = NULL, "updatedAt" = NOW()
        WHERE "id" = ${CONTA_AZUL_SESSION_ID}
      `;
    } catch (err) {
      this.logger.warn(
        `Falha ao liberar lock de refresh Conta Azul: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private cognitoSecretHash(username: string): string {
    return createHmac('sha256', this.clientSecret())
      .update(username + this.clientId())
      .digest('base64');
  }

  private async cognitoUserPassword(): Promise<ContaAzulTokenResponse> {
    const username = this.testUser();
    const password = this.testPassword();
    if (!username || !password) {
      throw new BadRequestException(
        'Configure CONTA_AZUL_TEST_USER e CONTA_AZUL_TEST_PASSWORD para o bootstrap da conta de teste.',
      );
    }
    return this.cognitoInitiate({
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
        SECRET_HASH: this.cognitoSecretHash(username),
      },
    });
  }

  private async cognitoRefresh(
    refreshToken: string,
  ): Promise<ContaAzulTokenResponse> {
    const username = this.testUser();
    const params: Record<string, string> = {
      REFRESH_TOKEN: refreshToken,
    };
    if (username) {
      params.SECRET_HASH = this.cognitoSecretHash(username);
    }
    return this.cognitoInitiate({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: params,
    });
  }

  private async cognitoInitiate(body: {
    AuthFlow: string;
    AuthParameters: Record<string, string>;
  }): Promise<ContaAzulTokenResponse> {
    const res = await axios.post(
      'https://cognito-idp.sa-east-1.amazonaws.com/',
      {
        AuthFlow: body.AuthFlow,
        ClientId: this.clientId(),
        AuthParameters: body.AuthParameters,
      },
      {
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target':
            'AWSCognitoIdentityProviderService.InitiateAuth',
        },
        timeout: 20_000,
        validateStatus: () => true,
      },
    );
    const data = res.data as {
      AuthenticationResult?: {
        AccessToken?: string;
        RefreshToken?: string;
        TokenType?: string;
        ExpiresIn?: number;
      };
      message?: string;
      __type?: string;
    };
    const auth = data.AuthenticationResult;
    if (!auth?.AccessToken) {
      throw new ServiceUnavailableException(
        data.message || data.__type || 'Cognito não devolveu access_token.',
      );
    }
    return {
      access_token: auth.AccessToken,
      refresh_token: auth.RefreshToken,
      token_type: auth.TokenType,
      expires_in: auth.ExpiresIn,
    };
  }

  private async exchangeCode(code: string): Promise<ContaAzulTokenResponse> {
    return this.postToken(
      {
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri(),
      },
      [CONTA_AZUL_AUTH_TOKEN, CONTA_AZUL_API_TOKEN],
    );
  }

  private async postToken(
    body: Record<string, string>,
    urls: string[],
  ): Promise<ContaAzulTokenResponse> {
    const headers = {
      Authorization: basicAuthHeader(this.clientId(), this.clientSecret()),
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    const encoded = new URLSearchParams(body).toString();
    let lastError: unknown;
    for (const url of urls) {
      try {
        const res = await axios.post<ContaAzulTokenResponse>(url, encoded, {
          headers,
          timeout: 20_000,
        } satisfies AxiosRequestConfig);
        if (!res.data?.access_token) {
          throw new ServiceUnavailableException(
            'Conta Azul não devolveu access_token.',
          );
        }
        this.logger.log(`Token Conta Azul obtido via ${url}`);
        return res.data;
      } catch (err) {
        lastError = err;
        const msg = this.axiosMessage(err as AxiosError);
        this.logger.warn(`Falha no token ${url}: ${msg}`);
        if (isContaAzulInvalidGrant(err)) break;
      }
    }
    throw new ServiceUnavailableException(
      `Falha OAuth Conta Azul: ${this.axiosMessage(lastError as AxiosError)}`,
    );
  }

  private async persistSession(
    tokens: ContaAzulTokenResponse,
    previousRefresh: string | null,
  ): Promise<StoredSession> {
    const session: StoredSession = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || previousRefresh || '',
      tokenType: tokens.token_type || 'Bearer',
      expiresAt: expiryFromExpiresIn(tokens.expires_in),
    };
    if (!session.refreshToken) {
      throw new ServiceUnavailableException(
        'Conta Azul não devolveu refresh_token.',
      );
    }
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        const saved = await this.persistSessionOnce(session, previousRefresh);
        this.logger.log(
          `Tokens Conta Azul persistidos imediatamente (expira ${saved.expiresAt.toISOString()}).`,
        );
        return saved;
      } catch (err) {
        lastErr = err;
        this.logger.error(
          `Falha ao persistir tokens Conta Azul (tentativa ${attempt}/5): ${err instanceof Error ? err.message : String(err)}`,
        );
        if (attempt === 5) break;
        await this.sleep(50 * attempt);
      }
    }
    throw new ServiceUnavailableException(
      `Falha ao gravar tokens da Conta Azul após refresh: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    );
  }

  private async persistSessionOnce(
    session: StoredSession,
    previousRefresh: string | null,
  ): Promise<StoredSession> {
    if (previousRefresh) {
      const updated = await this.updateSessionTokensCas(session, previousRefresh);
      if (Number(updated) > 0) return session;
      const latest = await this.loadSession();
      if (latest) {
        this.logger.warn(
          'Persistência CAS não atualizou a linha (refresh_token já mudou). Mantendo o token do banco.',
        );
        return latest;
      }
    }
    await this.upsertSessionTokens(session);
    return session;
  }

  private async updateSessionTokensCas(
    session: StoredSession,
    previousRefresh: string,
  ): Promise<number> {
    try {
      return await this.prisma.client.$executeRaw`
        UPDATE "ContaAzulSession"
        SET
          "accessToken" = ${session.accessToken},
          "refreshToken" = ${session.refreshToken},
          "tokenType" = ${session.tokenType},
          "expiresAt" = ${session.expiresAt},
          "refreshLockUntil" = NULL,
          "updatedAt" = NOW()
        WHERE "id" = ${CONTA_AZUL_SESSION_ID}
          AND "refreshToken" = ${previousRefresh}
      `;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/refreshLockUntil|does not exist/i.test(msg)) throw err;
      this.refreshLockColumnAvailable = false;
      return this.prisma.client.$executeRaw`
        UPDATE "ContaAzulSession"
        SET
          "accessToken" = ${session.accessToken},
          "refreshToken" = ${session.refreshToken},
          "tokenType" = ${session.tokenType},
          "expiresAt" = ${session.expiresAt},
          "updatedAt" = NOW()
        WHERE "id" = ${CONTA_AZUL_SESSION_ID}
          AND "refreshToken" = ${previousRefresh}
      `;
    }
  }

  private async upsertSessionTokens(session: StoredSession): Promise<void> {
    try {
      await this.prisma.client.$executeRaw`
        INSERT INTO "ContaAzulSession" ("id", "accessToken", "refreshToken", "tokenType", "expiresAt", "refreshLockUntil", "createdAt", "updatedAt")
        VALUES (
          ${CONTA_AZUL_SESSION_ID},
          ${session.accessToken},
          ${session.refreshToken},
          ${session.tokenType},
          ${session.expiresAt},
          NULL,
          NOW(),
          NOW()
        )
        ON CONFLICT ("id") DO UPDATE SET
          "accessToken" = EXCLUDED."accessToken",
          "refreshToken" = EXCLUDED."refreshToken",
          "tokenType" = EXCLUDED."tokenType",
          "expiresAt" = EXCLUDED."expiresAt",
          "refreshLockUntil" = NULL,
          "updatedAt" = NOW()
      `;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/refreshLockUntil|does not exist/i.test(msg)) throw err;
      this.refreshLockColumnAvailable = false;
      await this.prisma.client.$executeRaw`
        INSERT INTO "ContaAzulSession" ("id", "accessToken", "refreshToken", "tokenType", "expiresAt", "createdAt", "updatedAt")
        VALUES (
          ${CONTA_AZUL_SESSION_ID},
          ${session.accessToken},
          ${session.refreshToken},
          ${session.tokenType},
          ${session.expiresAt},
          NOW(),
          NOW()
        )
        ON CONFLICT ("id") DO UPDATE SET
          "accessToken" = EXCLUDED."accessToken",
          "refreshToken" = EXCLUDED."refreshToken",
          "tokenType" = EXCLUDED."tokenType",
          "expiresAt" = EXCLUDED."expiresAt",
          "updatedAt" = NOW()
      `;
    }
  }

  private async loadSession(): Promise<StoredSession | null> {
    try {
      const rows = await this.prisma.client.$queryRaw<
        Array<{
          accessToken: string;
          refreshToken: string;
          tokenType: string;
          expiresAt: Date;
        }>
      >`
        SELECT "accessToken", "refreshToken", "tokenType", "expiresAt"
        FROM "ContaAzulSession"
        WHERE "id" = ${CONTA_AZUL_SESSION_ID}
        LIMIT 1
      `;
      const row = rows[0];
      if (!row) return null;
      return {
        accessToken: row.accessToken,
        refreshToken: row.refreshToken,
        tokenType: row.tokenType,
        expiresAt: fromDbSessionTimestamp(new Date(row.expiresAt)),
      };
    } catch (err) {
      this.logger.warn(
        `ContaAzulSession indisponível: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private clientId(): string {
    return this.config.get<string>('CONTA_AZUL_CLIENT_ID')?.trim() || '';
  }

  private clientSecret(): string {
    return this.config.get<string>('CONTA_AZUL_CLIENT_SECRET')?.trim() || '';
  }

  private testUser(): string {
    return this.config.get<string>('CONTA_AZUL_TEST_USER')?.trim() || '';
  }

  private testPassword(): string {
    return this.config.get<string>('CONTA_AZUL_TEST_PASSWORD')?.trim() || '';
  }

  private redirectUri(): string {
    return this.config.get<string>('CONTA_AZUL_REDIRECT_URI')?.trim() || '';
  }

  private ensureConfigured(): void {
    if (!this.isConfigured()) {
      throw new BadRequestException(
        'Configure CONTA_AZUL_CLIENT_ID, CONTA_AZUL_CLIENT_SECRET e CONTA_AZUL_REDIRECT_URI.',
      );
    }
  }

  private pruneStates(): void {
    const cutoff = Date.now() - 10 * 60_000;
    for (const [state, meta] of this.pendingStates) {
      if (meta.createdAt < cutoff) this.pendingStates.delete(state);
    }
  }

  private addUtcDays(d: Date, days: number): Date {
    const next = new Date(d);
    next.setUTCHours(12, 0, 0, 0);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private async withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    let last: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await fn();
      } catch (err) {
        last = err;
        const status = (err as AxiosError).response?.status;
        const retryable =
          !status || status === 401 || status === 429 || status >= 500;
        if (!retryable || attempt === 3) throw err;
        this.logger.warn(
          `${label}: tentativa ${attempt} falhou (${status ?? 'sem status'}), repetindo.`,
        );
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      }
    }
    throw last;
  }

  private async windowHasNotas(start: string, end: string): Promise<boolean> {
    const nfe = await this.notasExistInWindow('/v1/notas-fiscais', {
      data_inicial: start,
      data_final: end,
    });
    if (nfe) return true;
    return this.notasExistInWindow('/v1/notas-fiscais-servico', {
      data_competencia_de: start,
      data_competencia_ate: end,
    });
  }

  private async notasExistInWindow(
    path: string,
    dateParams: Record<string, string>,
  ): Promise<boolean> {
    try {
      const payload = (await this.apiGet(path, {
        ...dateParams,
        pagina: 1,
        tamanho_pagina: 10,
      })) as Record<string, unknown>;
      const itens = Array.isArray(payload.itens)
        ? payload.itens
        : Array.isArray(payload.items)
          ? payload.items
          : [];
      return itens.length > 0;
    } catch (err) {
      this.logger.warn(
        `Sonda histórico ${path} ${dateParams.data_inicial ?? dateParams.data_competencia_de}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /**
   * Anda 15 dias para trás até 1 ano de janelas vazias após a última NF,
   * ou até 15 anos no passado. A API não impõe data mínima.
   */
  private async findHistoryStart(today: Date): Promise<string> {
    const floor = this.addUtcDays(today, -(15 * 365));
    let cursorEnd = new Date(today);
    cursorEnd.setUTCHours(12, 0, 0, 0);
    let earliest: string | null = null;
    let emptyAfterHit = 0;
    while (cursorEnd >= floor) {
      const start = this.addUtcDays(cursorEnd, -14);
      const from = start < floor ? floor : start;
      const startY = this.ymd(from);
      const endY = this.ymd(cursorEnd);
      const hit = await this.windowHasNotas(startY, endY);
      if (hit) {
        earliest = startY;
        emptyAfterHit = 0;
      } else if (earliest) {
        emptyAfterHit += 1;
        if (emptyAfterHit >= 24) break;
      }
      cursorEnd = this.addUtcDays(from, -1);
    }
    const resolved = earliest ?? this.ymd(this.addUtcDays(today, -540));
    this.logger.log(`Conta Azul histórico a partir de ${resolved}.`);
    return resolved;
  }

  private ymd(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  private axiosMessage(err: AxiosError | null): string {
    if (!err) return 'erro desconhecido';
    const data = err.response?.data;
    if (typeof data === 'string') return data.slice(0, 400);
    if (data && typeof data === 'object') {
      const rec = data as Record<string, unknown>;
      const msg = rec.error_description ?? rec.error ?? rec.message;
      if (typeof msg === 'string') return msg;
      try {
        return JSON.stringify(data).slice(0, 400);
      } catch {
        /* ignore */
      }
    }
    return err.message;
  }

  private truncate(value: unknown, max = 2500): unknown {
    try {
      const raw = JSON.stringify(value);
      if (raw.length <= max) return value;
      return { truncated: true, preview: raw.slice(0, max) };
    } catch {
      return null;
    }
  }
}
