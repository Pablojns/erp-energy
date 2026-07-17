import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@erp/database';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

type XbzProductRaw = {
  CodigoXbz?: string | number;
  CodigoComposto?: string | null;
  CodigoAmigavel?: string | null;
  Nome?: string | null;
  Descricao?: string | null;
  ImageLink?: string | null;
  SiteLink?: string | null;
  PrecoVenda?: string | number | null;
  QuantidadeDisponivel?: string | number | null;
  QuantidadeDisponivelEstoquePrincipal?: string | number | null;
  CorWebPrincipal?: string | null;
  CorWebSecundaria?: string | null;
  Ncm?: string | null;
  Peso?: string | number | null;
  Altura?: string | number | null;
  Largura?: string | number | null;
  Profundidade?: string | number | null;
};

export type CatalogSyncResult = {
  ok: boolean;
  skipped: boolean;
  message: string;
  upserted: number;
  lastSyncAt: string | null;
};

const SYNC_CONTROL_ID = 'xbz';
const DEFAULT_XBZ_URL =
  'https://api.minhaxbz.com.br:5001/api/clientes/GetListaDeProdutos';
const DEFAULT_XBZ_CNPJ = '48783884000124';
const DEFAULT_XBZ_TOKEN = 'X410CDFEAA';

@Injectable()
export class XbzIntegrationService {
  private readonly logger = new Logger(XbzIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private toNumber(value: string | number | null | undefined, fallback = 0): number {
    if (value === null || value === undefined || value === '') return fallback;
    const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  }

  private toInt(value: string | number | null | undefined, fallback = 0): number {
    return Math.max(0, Math.trunc(this.toNumber(value, fallback)));
  }

  private toDecimal(value: string | number | null | undefined): Prisma.Decimal {
    return new Prisma.Decimal(this.toNumber(value, 0));
  }

  private startOfTodayLocal(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  private async getSyncControl() {
    return this.prisma.client.quoteCatalogSyncControl.upsert({
      where: { id: SYNC_CONTROL_ID },
      create: { id: SYNC_CONTROL_ID },
      update: {},
    });
  }

  private async alreadySyncedToday(): Promise<{ yes: boolean; lastSyncAt: Date | null }> {
    const control = await this.getSyncControl();
    if (!control.lastSyncAt || control.lastStatus !== 'ok') {
      return { yes: false, lastSyncAt: control.lastSyncAt };
    }
    const start = this.startOfTodayLocal();
    return {
      yes: control.lastSyncAt >= start,
      lastSyncAt: control.lastSyncAt,
    };
  }

  async syncCatalog(options?: { force?: boolean }): Promise<CatalogSyncResult> {
    const force = options?.force === true;
    const check = await this.alreadySyncedToday();
    if (!force && check.yes) {
      return {
        ok: true,
        skipped: true,
        message:
          'Catálogo já sincronizado hoje. Limite de 1 sincronização por dia respeitado.',
        upserted: 0,
        lastSyncAt: check.lastSyncAt?.toISOString() ?? null,
      };
    }

    const cnpj =
      this.config.get<string>('XBZ_CNPJ')?.trim() || DEFAULT_XBZ_CNPJ;
    const token =
      this.config.get<string>('XBZ_TOKEN')?.trim() || DEFAULT_XBZ_TOKEN;
    const baseUrl =
      this.config.get<string>('XBZ_CATALOG_URL')?.trim() || DEFAULT_XBZ_URL;

    let rawList: XbzProductRaw[] = [];
    try {
      const response = await axios.get(baseUrl, {
        params: { cnpj, token },
        timeout: 120_000,
        validateStatus: (status) => status >= 200 && status < 300,
      });

      const data = response.data;
      if (Array.isArray(data)) {
        rawList = data as XbzProductRaw[];
      } else if (Array.isArray(data?.produtos)) {
        rawList = data.produtos as XbzProductRaw[];
      } else if (Array.isArray(data?.data)) {
        rawList = data.data as XbzProductRaw[];
      } else {
        throw new Error('Resposta da XBZ em formato inesperado.');
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao consultar API XBZ.';
      this.logger.error(`Sync catálogo XBZ falhou: ${message}`);
      try {
        await this.prisma.client.quoteCatalogSyncControl.upsert({
          where: { id: SYNC_CONTROL_ID },
          create: {
            id: SYNC_CONTROL_ID,
            lastStatus: 'error',
            lastError: message.slice(0, 2000),
            lastCount: 0,
          },
          update: {
            lastStatus: 'error',
            lastError: message.slice(0, 2000),
          },
        });
      } catch (persistErr) {
        this.logger.error(
          `Não foi possível gravar status de sync: ${
            persistErr instanceof Error ? persistErr.message : String(persistErr)
          }`,
        );
      }
      return {
        ok: false,
        skipped: false,
        message: `Falha na sincronização. Catálogo anterior mantido. ${message}`,
        upserted: 0,
        lastSyncAt: check.lastSyncAt?.toISOString() ?? null,
      };
    }

    const syncedAt = new Date();
    let upserted = 0;

    try {
      for (const raw of rawList) {
        const supplierCode = String(raw.CodigoXbz ?? '').trim();
        if (!supplierCode) continue;
        const name = String(raw.Nome ?? '').trim() || supplierCode;

        await this.prisma.client.quoteCatalogProduct.upsert({
          where: {
            supplier_supplierCode: { supplier: 'XBZ', supplierCode },
          },
          create: {
            supplierCode,
            compositeCode: raw.CodigoComposto?.toString().trim() || null,
            friendlyCode: raw.CodigoAmigavel?.toString().trim() || null,
            name,
            description: raw.Descricao?.toString().trim() || null,
            imageUrl: raw.ImageLink?.toString().trim() || null,
            siteLink: raw.SiteLink?.toString().trim() || null,
            salePrice: this.toDecimal(raw.PrecoVenda),
            availableQty: this.toInt(raw.QuantidadeDisponivel),
            mainStockQty: this.toInt(raw.QuantidadeDisponivelEstoquePrincipal),
            colorMain: raw.CorWebPrincipal?.toString().trim() || null,
            colorSecondary: raw.CorWebSecundaria?.toString().trim() || null,
            ncm: raw.Ncm?.toString().trim() || null,
            weight: this.toDecimal(raw.Peso),
            height: this.toDecimal(raw.Altura),
            width: this.toDecimal(raw.Largura),
            depth: this.toDecimal(raw.Profundidade),
            supplier: 'XBZ',
            active: true,
            lastSyncAt: syncedAt,
          },
          update: {
            compositeCode: raw.CodigoComposto?.toString().trim() || null,
            friendlyCode: raw.CodigoAmigavel?.toString().trim() || null,
            name,
            description: raw.Descricao?.toString().trim() || null,
            imageUrl: raw.ImageLink?.toString().trim() || null,
            siteLink: raw.SiteLink?.toString().trim() || null,
            salePrice: this.toDecimal(raw.PrecoVenda),
            availableQty: this.toInt(raw.QuantidadeDisponivel),
            mainStockQty: this.toInt(raw.QuantidadeDisponivelEstoquePrincipal),
            colorMain: raw.CorWebPrincipal?.toString().trim() || null,
            colorSecondary: raw.CorWebSecundaria?.toString().trim() || null,
            ncm: raw.Ncm?.toString().trim() || null,
            weight: this.toDecimal(raw.Peso),
            height: this.toDecimal(raw.Altura),
            width: this.toDecimal(raw.Largura),
            depth: this.toDecimal(raw.Profundidade),
            supplier: 'XBZ',
            active: true,
            lastSyncAt: syncedAt,
          },
        });
        upserted += 1;
      }

      await this.prisma.client.quoteCatalogSyncControl.upsert({
        where: { id: SYNC_CONTROL_ID },
        create: {
          id: SYNC_CONTROL_ID,
          lastSyncAt: syncedAt,
          lastStatus: 'ok',
          lastCount: upserted,
          lastError: null,
        },
        update: {
          lastSyncAt: syncedAt,
          lastStatus: 'ok',
          lastCount: upserted,
          lastError: null,
        },
      });

      this.logger.log(`Catálogo XBZ sincronizado: ${upserted} produtos.`);
      return {
        ok: true,
        skipped: false,
        message: `Sincronização concluída: ${upserted} produtos atualizados.`,
        upserted,
        lastSyncAt: syncedAt.toISOString(),
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao gravar catálogo local.';
      this.logger.error(`Persistência do catálogo XBZ falhou: ${message}`);
      await this.prisma.client.quoteCatalogSyncControl.upsert({
        where: { id: SYNC_CONTROL_ID },
        create: {
          id: SYNC_CONTROL_ID,
          lastStatus: 'error',
          lastError: message.slice(0, 2000),
          lastCount: upserted,
        },
        update: {
          lastStatus: 'error',
          lastError: message.slice(0, 2000),
          lastCount: upserted,
        },
      });
      return {
        ok: false,
        skipped: false,
        message: `Erro ao salvar catálogo. ${message}`,
        upserted,
        lastSyncAt: check.lastSyncAt?.toISOString() ?? null,
      };
    }
  }

  async listCatalog(query: {
    search?: string;
    active?: boolean;
    page?: number;
    pageSize?: number;
    includeTotal?: boolean;
    sortBy?: 'price' | 'name' | 'stock' | 'lastUpdate';
    sortOrder?: 'asc' | 'desc';
    minPrice?: number;
    maxPrice?: number;
    supplier?: string;
    inStockOnly?: boolean;
  }) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize =
      query.pageSize && query.pageSize > 0 && query.pageSize <= 100
        ? query.pageSize
        : 20;
    const includeTotal = query.includeTotal !== false;
    const sortOrder = query.sortOrder === 'desc' ? 'desc' : 'asc';

    const where: Prisma.QuoteCatalogProductWhereInput = {};
    if (query.active !== undefined) where.active = query.active;

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { supplierCode: { contains: search, mode: 'insensitive' } },
        { friendlyCode: { contains: search, mode: 'insensitive' } },
        { compositeCode: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const supplier = query.supplier?.trim();
    if (supplier) {
      where.supplier = { equals: supplier, mode: 'insensitive' };
    }

    if (query.inStockOnly) {
      where.availableQty = { gt: 0 };
    }

    const priceFilter: Prisma.DecimalFilter = {};
    if (query.minPrice !== undefined && Number.isFinite(query.minPrice)) {
      priceFilter.gte = new Prisma.Decimal(query.minPrice);
    }
    if (query.maxPrice !== undefined && Number.isFinite(query.maxPrice)) {
      priceFilter.lte = new Prisma.Decimal(query.maxPrice);
    }
    if (Object.keys(priceFilter).length > 0) {
      where.salePrice = priceFilter;
    }

    let orderBy: Prisma.QuoteCatalogProductOrderByWithRelationInput[];
    switch (query.sortBy) {
      case 'price':
        orderBy = [{ salePrice: sortOrder }, { name: 'asc' }];
        break;
      case 'stock':
        orderBy = [{ availableQty: sortOrder }, { name: 'asc' }];
        break;
      case 'lastUpdate':
        orderBy = [{ lastSyncAt: sortOrder }, { name: 'asc' }];
        break;
      case 'name':
      default:
        orderBy = [{ name: sortOrder }];
        break;
    }

    const controlPromise = this.getSyncControl();
    const rowsPromise = this.prisma.client.quoteCatalogProduct.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const [rows, control, total] = await Promise.all([
      rowsPromise,
      controlPromise,
      includeTotal
        ? this.prisma.client.quoteCatalogProduct.count({ where })
        : Promise.resolve(null as number | null),
    ]);

    const hasMore = includeTotal
      ? page * pageSize < (total ?? 0)
      : rows.length === pageSize;

    return {
      data: rows.map((row) => ({
        id: row.id,
        supplierCode: row.supplierCode,
        compositeCode: row.compositeCode,
        friendlyCode: row.friendlyCode,
        name: row.name,
        description: row.description,
        imageUrl: row.imageUrl,
        siteLink: row.siteLink,
        salePrice: row.salePrice.toString(),
        availableQty: row.availableQty,
        mainStockQty: row.mainStockQty,
        colorMain: row.colorMain,
        colorSecondary: row.colorSecondary,
        ncm: row.ncm,
        weight: row.weight?.toString() ?? '0',
        height: row.height?.toString() ?? '0',
        width: row.width?.toString() ?? '0',
        depth: row.depth?.toString() ?? '0',
        supplier: row.supplier,
        active: row.active,
        lastSyncAt: row.lastSyncAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      })),
      meta: {
        page,
        pageSize,
        total: total ?? rows.length,
        totalPages: total != null ? Math.max(1, Math.ceil(total / pageSize)) : 1,
        hasMore,
        lastSyncAt: control.lastSyncAt?.toISOString() ?? null,
        lastStatus: control.lastStatus,
        lastCount: control.lastCount,
      },
    };
  }
}
