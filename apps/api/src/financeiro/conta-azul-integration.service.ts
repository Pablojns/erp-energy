import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@erp/database';
import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import { createHmac, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
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
  CA_NF_NOT_SYNCED_MESSAGE,
  detectCaNfFile,
  invoiceDescricaoMatchPattern,
  nfNumberKey,
  nfeDownloadFilename,
  tituloMatchesInvoiceNumber,
} from './conta-azul.nfe-download';
import {
  documentDigits,
  mapContaAzulPessoa,
  planPessoasDivergencias,
  type CaPessoa,
  type ErpPartyInput,
  type PessoaDivergence,
} from './conta-azul.pessoas';
import {
  mapContaAzulCategoria,
  mapContaAzulCentroCusto,
  type CaCatalogoItem,
} from './conta-azul.catalogos';
import {
  mapContaAzulVenda,
  planVendaVinculos,
  type CaVenda,
  type VendaSemMatch,
  type VendaVinculoPreview,
} from './conta-azul.vendas';

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
  private refreshInFlight: Promise<StoredSession> | null = null;
  private refreshLockColumnAvailable = true;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly financeiro: FinanceiroService,
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
   * P0: pessoas + catálogos + amostra de categoria/centro nos títulos.
   * Dry-run só reporta. Apply grava espelhos Conta Azul — não sobrescreve cadastro ERP.
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
    };
    message: string;
  }> {
    this.ensureConfigured();
    const previewLimit = Math.max(1, Math.min(50, options.previewLimit ?? 20));
    const [customers, suppliers, carriers] = await Promise.all([
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

    const listed = await this.listAllPessoas();
    const { pessoas, detalhesBuscados } = await this.enrichPessoasAddresses(
      listed,
      neededDigits,
    );
    const plan = planPessoasDivergencias({ pessoas, parties });
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
          'Dry-run P0: nenhum cadastro do ERP foi alterado. apply=true só grava espelhos Conta Azul (pessoas/catálogos).',
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
    this.logger.log(
      `Conta Azul P0 apply: ${pessoasGravadas} pessoas, ${categoriasGravadas} categorias, ${centrosGravados} centros.`,
    );
    return {
      ...report,
      apply: true,
      applied: true,
      appliedCounts: {
        pessoasGravadas,
        categoriasGravadas,
        centrosGravados,
      },
      message:
        'Aplicado P0: espelhos gravados. Customer/Supplier/Carrier do ERP não foram sobrescritos.',
    };
  }

  /**
   * P1: GET /v1/venda/busca cruzado com pedidos do ERP.
   * Apply só preenche Order.contaAzulVendaId em matches claros.
   */
  async sincronizarVendas(options: {
    apply: boolean;
    previewLimit?: number;
  }): Promise<{
    ok: true;
    apply: boolean;
    applied: boolean;
    vendas: number;
    pedidos: number;
    vinculados: number;
    semCorrespondencia: number;
    jaVinculados: number;
    porRazao: Record<string, number>;
    previewClaros: VendaVinculoPreview[];
    previewSemMatch: VendaSemMatch[];
    appliedCounts?: { pedidosVinculados: number };
    message: string;
  }> {
    this.ensureConfigured();
    const previewLimit = Math.max(1, Math.min(50, options.previewLimit ?? 20));
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
      porRazao,
      previewClaros: plan.claros.slice(0, previewLimit),
      previewSemMatch: plan.semCorrespondencia.slice(0, previewLimit),
    };

    if (!options.apply) {
      return {
        ...report,
        apply: false,
        applied: false,
        message:
          'Dry-run P1: nenhum pedido foi vinculado. apply=true grava Order.contaAzulVendaId só nos matches claros.',
      };
    }

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
    return {
      ...report,
      apply: true,
      applied: true,
      appliedCounts: { pedidosVinculados },
      message: `Aplicado P1: ${pedidosVinculados} pedido(s) vinculados à venda da Conta Azul.`,
    };
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
  async downloadNotaFiscal(invoiceNumber: string): Promise<{
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
    const titulo = await this.findSyncedTituloByInvoice(numero);
    if (!titulo) {
      throw new NotFoundException(CA_NF_NOT_SYNCED_MESSAGE);
    }
    const around = titulo.competencia ?? titulo.vencimento;
    const chave = await this.resolveChaveAcesso(numero, around);
    if (!chave) {
      throw new NotFoundException(
        'Título financeiro encontrado, mas o XML da NF-e não foi localizado na Conta Azul. Confira o número da nota ou sincronize de novo.',
      );
    }
    let buffer: Buffer;
    try {
      buffer = await this.apiGetBuffer(`/v1/notas-fiscais/${chave}`);
    } catch (err) {
      const ax = err as AxiosError;
      if (ax.response?.status === 404) {
        throw new NotFoundException(CA_NF_NOT_SYNCED_MESSAGE);
      }
      throw err;
    }
    if (!buffer.length) {
      throw new ServiceUnavailableException(
        'A Conta Azul devolveu um arquivo vazio para esta nota.',
      );
    }
    const kind = detectCaNfFile(buffer);
    return {
      buffer,
      contentType: 'application/octet-stream',
      filename: nfeDownloadFilename(numero, kind.ext),
    };
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
    dateParams: Record<string, string>,
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
  ): Promise<string | null> {
    const nota = Number(numero);
    for (const window of this.nfeLookupWindows(around)) {
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

  /** Janela de 15 dias centrada na competência, mais vizinhas (±15d). */
  private nfeLookupWindows(
    around: Date,
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
    const windows: Array<{ start: string; end: string }> = [];
    for (const shiftDays of [0, -15, 15, -45, 45, -90, 90]) {
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
