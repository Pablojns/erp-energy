import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@erp/database';
import axios, { type AxiosError } from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import type { CatalogSyncResult } from './xbz-integration.service';

const SYNC_CONTROL_ID = 'spot';
const SUPPLIER = 'SPOT';
const DEFAULT_BASE_URL = 'https://ws.spotgifts.com.br/api/v1SSL';
/** Margem de segurança antes do vencimento real do token (ms). */
const TOKEN_SKEW_MS = 60_000;
/** Validade padrão quando a API não informa expiração (55 min). */
const DEFAULT_TOKEN_TTL_MS = 55 * 60_000;

export type SpotOrderLineInput = {
  sku: string;
  quantity: number;
  engraving?: string | null;
  artworkBase64?: string | null;
  artworkFileName?: string | null;
  artworkMimeType?: string | null;
  serviceCode?: string | null;
  logoWidth?: number | null;
  logoHeight?: number | null;
  logoArea?: number | null;
};

export type SpotOrderPayload = {
  lines: SpotOrderLineInput[];
  destination?: Record<string, unknown>;
  courier?: string | null;
  observations?: string | null;
  internalReference?: string | null;
  test?: boolean;
};

@Injectable()
export class SpotIntegrationService {
  private readonly logger = new Logger(SpotIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private getAccessKey(): string {
    return this.config.get<string>('SPOT_ACCESS_KEY')?.trim() || '';
  }

  private getClientId(): string {
    return this.config.get<string>('SPOT_CLIENT_ID')?.trim() || '';
  }

  private getBaseUrl(): string {
    const raw =
      this.config.get<string>('SPOT_BASE_URL')?.trim() || DEFAULT_BASE_URL;
    return raw.replace(/\/+$/, '');
  }

  private ensureCredentialsConfigured(): void {
    if (!this.getAccessKey()) {
      throw new BadRequestException(
        'Credenciais SPOT não configuradas. Defina SPOT_ACCESS_KEY no servidor.',
      );
    }
  }

  private isConfigured(): boolean {
    return Boolean(this.getAccessKey());
  }

  private toNumber(value: unknown, fallback = 0): number {
    if (value === null || value === undefined || value === '') return fallback;
    const n =
      typeof value === 'number'
        ? value
        : Number(String(value).replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  }

  private toInt(value: unknown, fallback = 0): number {
    return Math.max(0, Math.trunc(this.toNumber(value, fallback)));
  }

  private toDecimal(value: unknown): Prisma.Decimal {
    return new Prisma.Decimal(this.toNumber(value, 0));
  }

  private toOptionalDecimal(value: unknown): Prisma.Decimal | null {
    if (value === null || value === undefined || value === '') return null;
    const n = this.toNumber(value, NaN);
    return Number.isFinite(n) ? new Prisma.Decimal(n) : null;
  }

  private unwrapList(data: unknown): Record<string, unknown>[] {
    if (Array.isArray(data)) {
      return data.filter(
        (item): item is Record<string, unknown> =>
          item != null && typeof item === 'object',
      );
    }
    if (!data || typeof data !== 'object') return [];
    const obj = data as Record<string, unknown>;
    const candidates = [
      obj.Products,
      obj.products,
      obj.ProductsTree,
      obj.productsTree,
      obj.Colors,
      obj.colors,
      obj.Stocks,
      obj.stocks,
      obj.CatalogPrices,
      obj.catalogPrices,
      obj.Optionals,
      obj.optionals,
      obj.OptionalsComplete,
      obj.optionalsComplete,
      obj.CustomizationOptions,
      obj.customizationOptions,
      obj.Data,
      obj.data,
      obj.Items,
      obj.items,
      obj.List,
      obj.list,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.filter(
          (item): item is Record<string, unknown> =>
            item != null && typeof item === 'object',
        );
      }
      if (candidate && typeof candidate === 'object') {
        const nested = candidate as Record<string, unknown>;
        for (const key of Object.keys(nested)) {
          const value = nested[key];
          if (Array.isArray(value)) {
            return value.filter(
              (item): item is Record<string, unknown> =>
                item != null && typeof item === 'object',
            );
          }
        }
      }
    }
    return [];
  }

  private pickString(
    row: Record<string, unknown>,
    keys: string[],
  ): string | null {
    for (const key of keys) {
      const value = row[key];
      if (value == null) continue;
      const text = String(value).trim();
      if (text) return text;
    }
    return null;
  }

  private logSpotFailure(context: string, err: unknown): void {
    const axiosErr = err as AxiosError | undefined;
    const status = axiosErr?.response?.status;
    const body = axiosErr?.response?.data;
    const detail =
      err instanceof Error ? err.message : typeof err === 'string' ? err : String(err);
    const invalidCreds =
      status === 401 ||
      status === 403 ||
      /invalid|expir|unauthor|access.?key|credencial/i.test(detail) ||
      (typeof body === 'string' && /invalid|expir|unauthor/i.test(body)) ||
      (body &&
        typeof body === 'object' &&
        /invalid|expir|unauthor/i.test(JSON.stringify(body)));

    if (invalidCreds) {
      this.logger.error(
        `SPOT: credenciais inválidas ou expiradas (${context}): ${detail}`,
      );
    } else {
      this.logger.error(`SPOT: falha em ${context}: ${detail}`);
    }
  }

  private async request<T = unknown>(
    method: 'GET' | 'POST',
    path: string,
    options?: {
      params?: Record<string, string | number | boolean | undefined | null>;
      data?: unknown;
      token?: string;
      timeoutMs?: number;
    },
  ): Promise<T> {
    const url = `${this.getBaseUrl()}/${path.replace(/^\//, '')}`;
    const params: Record<string, string | number | boolean> = {};
    if (options?.token) params.token = options.token;
    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value === undefined || value === null || value === '') continue;
        params[key] = value;
      }
    }

    const response = await axios.request<T>({
      method,
      url,
      params,
      data: options?.data,
      timeout: options?.timeoutMs ?? 120_000,
      validateStatus: (status) => status >= 200 && status < 300,
    });
    return response.data;
  }

  private parseExpiry(data: Record<string, unknown>): Date {
    const dateKeys = [
      'ExpiresAt',
      'expiresAt',
      'ExpireDate',
      'expireDate',
      'ValidUntil',
      'validUntil',
      'ExpirationDate',
      'expirationDate',
    ];
    for (const key of dateKeys) {
      const raw = data[key];
      if (!raw) continue;
      const parsed = new Date(String(raw));
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    const minutesKeys = [
      'ValidityMinutes',
      'validityMinutes',
      'ExpiresInMinutes',
      'expiresInMinutes',
      'ExpiresIn',
      'expiresIn',
      'ValidForMinutes',
    ];
    for (const key of minutesKeys) {
      const minutes = this.toNumber(data[key], NaN);
      if (Number.isFinite(minutes) && minutes > 0) {
        const ms = minutes > 10_000 ? minutes * 1000 : minutes * 60_000;
        return new Date(Date.now() + ms);
      }
    }

    return new Date(Date.now() + DEFAULT_TOKEN_TTL_MS);
  }

  /**
   * Autentica na API SPOT e persiste token em SpotSession (substitui sessão anterior).
   */
  async authenticate(): Promise<{ token: string; expiresAt: Date }> {
    this.ensureCredentialsConfigured();
    const accessKey = this.getAccessKey();
    const clientId = this.getClientId();

    try {
      const data = await this.request<Record<string, unknown>>(
        'GET',
        'AuthenticateClient',
        {
          params: {
            accessKey,
            ...(clientId ? { clientId } : {}),
          },
          timeoutMs: 30_000,
        },
      );

      const errorCodeRaw = data.ErrorCode ?? data.errorCode;
      const errorCode =
        errorCodeRaw === null ||
        errorCodeRaw === undefined ||
        errorCodeRaw === '' ||
        errorCodeRaw === 0
          ? null
          : String(errorCodeRaw).trim();
      const errorMessage = this.pickString(data, [
        'ErrorMessage',
        'errorMessage',
        'Message',
        'message',
      ]);
      if (errorCode) {
        throw new Error(
          errorMessage || `AuthenticateClient retornou ErrorCode=${errorCode}`,
        );
      }

      const token = this.pickString(data, ['Token', 'token', 'AccessToken']);
      if (!token) {
        throw new Error('AuthenticateClient não retornou Token.');
      }

      const expiresAt = this.parseExpiry(data);

      await this.prisma.client.$transaction(async (tx) => {
        await tx.spotSession.deleteMany({});
        await tx.spotSession.create({
          data: { token, expiresAt },
        });
      });

      this.logger.log(
        `SPOT: sessão autenticada até ${expiresAt.toISOString()}`,
      );
      return { token, expiresAt };
    } catch (err) {
      this.logSpotFailure('authenticate', err);
      throw err instanceof BadRequestException
        ? err
        : new BadRequestException(
            'SPOT: credenciais inválidas ou expiradas. Verifique SPOT_ACCESS_KEY.',
          );
    }
  }

  /**
   * Retorna token válido; autentica automaticamente se necessário.
   */
  async getValidToken(): Promise<string> {
    this.ensureCredentialsConfigured();

    const session = await this.prisma.client.spotSession.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    const stillValid =
      session &&
      session.expiresAt.getTime() - TOKEN_SKEW_MS > Date.now() &&
      session.token.trim().length > 0;

    if (stillValid) {
      return session.token;
    }

    const auth = await this.authenticate();
    return auth.token;
  }

  private async withToken<T>(
    fn: (token: string) => Promise<T>,
  ): Promise<T | null> {
    if (!this.isConfigured()) {
      this.logger.warn('SPOT: credenciais não configuradas — operação ignorada.');
      return null;
    }
    try {
      const token = await this.getValidToken();
      return await fn(token);
    } catch (err) {
      this.logSpotFailure('request', err);
      return null;
    }
  }

  async getProducts(): Promise<Record<string, unknown>[]> {
    const data = await this.withToken((token) =>
      this.request('GET', 'products', {
        token,
        params: { lang: 'PT' },
      }),
    );
    return data ? this.unwrapList(data) : [];
  }

  async getProductsTree(): Promise<Record<string, unknown>[]> {
    const data = await this.withToken((token) =>
      this.request('GET', 'productsTree', {
        token,
        params: { lang: 'PT' },
      }),
    );
    return data ? this.unwrapList(data) : [];
  }

  async getColors(): Promise<Record<string, unknown>[]> {
    const data = await this.withToken((token) =>
      this.request('GET', 'colors', {
        token,
        params: { lang: 'PT' },
      }),
    );
    return data ? this.unwrapList(data) : [];
  }

  async getCatalogPrices(): Promise<Record<string, unknown>[]> {
    const data = await this.withToken((token) =>
      this.request('GET', 'catalogPrices', { token }),
    );
    return data ? this.unwrapList(data) : [];
  }

  async getOptionalsComplete(): Promise<Record<string, unknown>[]> {
    const data = await this.withToken((token) =>
      this.request('GET', 'optionalsComplete', {
        token,
        params: { lang: 'PT' },
      }),
    );
    return data ? this.unwrapList(data) : [];
  }

  async getStocks(): Promise<Record<string, unknown>[]> {
    const data = await this.withToken((token) =>
      this.request('GET', 'Stocks', {
        token,
        params: { lang: 'PT' },
      }),
    );
    return data ? this.unwrapList(data) : [];
  }

  private extractSku(row: Record<string, unknown>): string | null {
    return this.pickString(row, [
      'Sku',
      'SKU',
      'sku',
      'ProductSku',
      'productSku',
      'Reference',
      'reference',
      'Ref',
      'Code',
      'code',
      'ProductCode',
      'productCode',
    ]);
  }

  private extractProductName(row: Record<string, unknown>): string | null {
    return this.pickString(row, [
      'Name',
      'name',
      'ProductName',
      'productName',
      'Title',
      'title',
      'Description',
      'description',
    ]);
  }

  private buildPriceMap(
    prices: Record<string, unknown>[],
  ): Map<string, number> {
    const map = new Map<string, number>();
    for (const row of prices) {
      const sku = this.extractSku(row);
      if (!sku) continue;
      const price = this.toNumber(
        row.Price ??
          row.price ??
          row.SalePrice ??
          row.salePrice ??
          row.CatalogPrice ??
          row.catalogPrice ??
          row.UnitPrice ??
          row.unitPrice,
        NaN,
      );
      if (Number.isFinite(price)) map.set(sku, price);
    }
    return map;
  }

  private buildStockMap(
    stocks: Record<string, unknown>[],
  ): Map<string, number> {
    const map = new Map<string, number>();
    for (const row of stocks) {
      const sku = this.extractSku(row);
      if (!sku) continue;
      const qty = this.toInt(
        row.Stock ??
          row.stock ??
          row.Quantity ??
          row.quantity ??
          row.AvailableQty ??
          row.availableQty ??
          row.Qty ??
          row.qty,
        0,
      );
      map.set(sku, qty);
    }
    return map;
  }

  private collectEngravingOptions(
    optionals: Record<string, unknown>[],
  ): Array<{
    productSku: string;
    techniqueName: string;
    price: Prisma.Decimal | null;
    maxWidth: Prisma.Decimal | null;
    maxHeight: Prisma.Decimal | null;
  }> {
    const out: Array<{
      productSku: string;
      techniqueName: string;
      price: Prisma.Decimal | null;
      maxWidth: Prisma.Decimal | null;
      maxHeight: Prisma.Decimal | null;
    }> = [];

    const pushOption = (productSku: string, opt: Record<string, unknown>) => {
      const techniqueName =
        this.pickString(opt, [
          'TechniqueName',
          'techniqueName',
          'Technique',
          'technique',
          'Name',
          'name',
          'ServiceName',
          'serviceName',
          'Customization',
          'customization',
        ]) || null;
      if (!techniqueName) return;
      out.push({
        productSku,
        techniqueName,
        price: this.toOptionalDecimal(
          opt.Price ?? opt.price ?? opt.Cost ?? opt.cost,
        ),
        maxWidth: this.toOptionalDecimal(
          opt.MaxWidth ??
            opt.maxWidth ??
            opt.LogoWidth ??
            opt.logoWidth ??
            opt.Width ??
            opt.width,
        ),
        maxHeight: this.toOptionalDecimal(
          opt.MaxHeight ??
            opt.maxHeight ??
            opt.LogoHeight ??
            opt.logoHeight ??
            opt.Height ??
            opt.height,
        ),
      });
    };

    for (const row of optionals) {
      const productSku =
        this.extractSku(row) ||
        this.pickString(row, ['ProductReference', 'productReference']);
      if (!productSku) continue;

      const nestedCandidates = [
        row.CustomizationOptions,
        row.customizationOptions,
        row.Techniques,
        row.techniques,
        row.Optionals,
        row.optionals,
        row.Services,
        row.services,
      ];

      let foundNested = false;
      for (const nested of nestedCandidates) {
        if (!Array.isArray(nested)) continue;
        foundNested = true;
        for (const item of nested) {
          if (item && typeof item === 'object') {
            pushOption(productSku, item as Record<string, unknown>);
          }
        }
      }

      if (!foundNested) {
        pushOption(productSku, row);
      }
    }

    return out;
  }

  private normalizeProducts(
    products: Record<string, unknown>[],
    priceMap: Map<string, number>,
    stockMap: Map<string, number>,
  ): Array<{
    supplierCode: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    siteLink: string | null;
    salePrice: Prisma.Decimal;
    availableQty: number;
    mainStockQty: number;
    colorMain: string | null;
    weight: Prisma.Decimal | null;
    height: Prisma.Decimal | null;
    width: Prisma.Decimal | null;
    depth: Prisma.Decimal | null;
  }> {
    const bySku = new Map<
      string,
      {
        supplierCode: string;
        name: string;
        description: string | null;
        imageUrl: string | null;
        siteLink: string | null;
        salePrice: Prisma.Decimal;
        availableQty: number;
        mainStockQty: number;
        colorMain: string | null;
        weight: Prisma.Decimal | null;
        height: Prisma.Decimal | null;
        width: Prisma.Decimal | null;
        depth: Prisma.Decimal | null;
      }
    >();

    for (const row of products) {
      const supplierCode = this.extractSku(row);
      if (!supplierCode) continue;
      const name =
        this.extractProductName(row) ||
        this.pickString(row, ['ShortDescription', 'shortDescription']) ||
        supplierCode;
      const description =
        this.pickString(row, [
          'LongDescription',
          'longDescription',
          'Description',
          'description',
          'Detail',
          'detail',
        ]) || null;
      const imageUrl =
        this.pickString(row, [
          'ImageUrl',
          'imageUrl',
          'Image',
          'image',
          'ImageLink',
          'imageLink',
          'Photo',
          'photo',
        ]) || null;
      const siteLink =
        this.pickString(row, ['SiteLink', 'siteLink', 'Url', 'url', 'Link']) ||
        null;
      const colorMain =
        this.pickString(row, [
          'Color',
          'color',
          'ColorName',
          'colorName',
          'MainColor',
          'mainColor',
        ]) || null;

      const priceFromRow = this.toNumber(
        row.Price ??
          row.price ??
          row.SalePrice ??
          row.salePrice ??
          row.CatalogPrice ??
          row.catalogPrice,
        NaN,
      );
      const salePrice = new Prisma.Decimal(
        Number.isFinite(priceFromRow)
          ? priceFromRow
          : (priceMap.get(supplierCode) ?? 0),
      );

      const stockFromRow = this.toInt(
        row.Stock ??
          row.stock ??
          row.AvailableQty ??
          row.availableQty ??
          row.Quantity ??
          row.quantity,
        NaN,
      );
      const availableQty = Number.isFinite(stockFromRow)
        ? stockFromRow
        : (stockMap.get(supplierCode) ?? 0);

      bySku.set(supplierCode, {
        supplierCode,
        name,
        description,
        imageUrl,
        siteLink,
        salePrice,
        availableQty,
        mainStockQty: availableQty,
        colorMain,
        weight: this.toOptionalDecimal(row.Weight ?? row.weight),
        height: this.toOptionalDecimal(row.Height ?? row.height),
        width: this.toOptionalDecimal(row.Width ?? row.width),
        depth: this.toOptionalDecimal(
          row.Depth ?? row.depth ?? row.Length ?? row.length,
        ),
      });
    }

    return [...bySku.values()];
  }

  async syncCatalog(options?: { force?: boolean }): Promise<CatalogSyncResult> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        skipped: true,
        message:
          'Configure as credenciais SPOT no servidor para sincronizar este fornecedor.',
        upserted: 0,
        lastSyncAt: null,
      };
    }

    const control = await this.prisma.client.quoteCatalogSyncControl.upsert({
      where: { id: SYNC_CONTROL_ID },
      create: { id: SYNC_CONTROL_ID },
      update: {},
    });

    try {
      const token = await this.getValidToken();

      const [
        productsTree,
        products,
        colors,
        catalogPrices,
        optionalsComplete,
        stocks,
      ] = await Promise.all([
        this.request('GET', 'productsTree', {
          token,
          params: { lang: 'PT' },
        })
          .then((d) => this.unwrapList(d))
          .catch((err) => {
            this.logSpotFailure('productsTree', err);
            return [] as Record<string, unknown>[];
          }),
        this.request('GET', 'products', {
          token,
          params: { lang: 'PT' },
        })
          .then((d) => this.unwrapList(d))
          .catch((err) => {
            this.logSpotFailure('products', err);
            return [] as Record<string, unknown>[];
          }),
        this.request('GET', 'colors', {
          token,
          params: { lang: 'PT' },
        })
          .then((d) => this.unwrapList(d))
          .catch((err) => {
            this.logSpotFailure('colors', err);
            return [] as Record<string, unknown>[];
          }),
        this.request('GET', 'catalogPrices', { token })
          .then((d) => this.unwrapList(d))
          .catch((err) => {
            this.logSpotFailure('catalogPrices', err);
            return [] as Record<string, unknown>[];
          }),
        this.request('GET', 'optionalsComplete', {
          token,
          params: { lang: 'PT' },
        })
          .then((d) => this.unwrapList(d))
          .catch((err) => {
            this.logSpotFailure('optionalsComplete', err);
            return [] as Record<string, unknown>[];
          }),
        this.request('GET', 'Stocks', {
          token,
          params: { lang: 'PT' },
        })
          .then((d) => this.unwrapList(d))
          .catch((err) => {
            this.logSpotFailure('Stocks', err);
            return [] as Record<string, unknown>[];
          }),
      ]);

      void colors;
      void options?.force;

      const priceMap = this.buildPriceMap(catalogPrices);
      const stockMap = this.buildStockMap(stocks);
      const productSource =
        productsTree.length > 0 ? productsTree : products;
      const normalized = this.normalizeProducts(
        productSource,
        priceMap,
        stockMap,
      );

      if (normalized.length === 0) {
        const message =
          'SPOT: nenhum produto retornado pela API (credenciais inválidas/expiradas ou resposta vazia).';
        this.logger.error(message);
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
        return {
          ok: false,
          skipped: false,
          message,
          upserted: 0,
          lastSyncAt: control.lastSyncAt?.toISOString() ?? null,
        };
      }

      const syncedAt = new Date();
      let upserted = 0;

      for (const product of normalized) {
        await this.prisma.client.quoteCatalogProduct.upsert({
          where: {
            supplier_supplierCode: {
              supplier: SUPPLIER,
              supplierCode: product.supplierCode,
            },
          },
          create: {
            supplierCode: product.supplierCode,
            name: product.name,
            description: product.description,
            imageUrl: product.imageUrl,
            siteLink: product.siteLink,
            salePrice: product.salePrice,
            availableQty: product.availableQty,
            mainStockQty: product.mainStockQty,
            colorMain: product.colorMain,
            weight: product.weight,
            height: product.height,
            width: product.width,
            depth: product.depth,
            supplier: SUPPLIER,
            active: true,
            lastSyncAt: syncedAt,
          },
          update: {
            name: product.name,
            description: product.description,
            imageUrl: product.imageUrl,
            siteLink: product.siteLink,
            salePrice: product.salePrice,
            availableQty: product.availableQty,
            mainStockQty: product.mainStockQty,
            colorMain: product.colorMain,
            weight: product.weight,
            height: product.height,
            width: product.width,
            depth: product.depth,
            supplier: SUPPLIER,
            active: true,
            lastSyncAt: syncedAt,
          },
        });
        upserted += 1;
      }

      const engravingOptions = this.collectEngravingOptions(optionalsComplete);
      for (const option of engravingOptions) {
        await this.prisma.client.quoteCatalogEngravingOption.upsert({
          where: {
            productSku_supplier_techniqueName: {
              productSku: option.productSku,
              supplier: SUPPLIER,
              techniqueName: option.techniqueName,
            },
          },
          create: {
            productSku: option.productSku,
            supplier: SUPPLIER,
            techniqueName: option.techniqueName,
            price: option.price,
            maxWidth: option.maxWidth,
            maxHeight: option.maxHeight,
          },
          update: {
            price: option.price,
            maxWidth: option.maxWidth,
            maxHeight: option.maxHeight,
          },
        });
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

      this.logger.log(
        `Catálogo SPOT sincronizado: ${upserted} produtos, ${engravingOptions.length} opções de gravação.`,
      );
      return {
        ok: true,
        skipped: false,
        message: `Sincronização SPOT concluída: ${upserted} produtos atualizados.`,
        upserted,
        lastSyncAt: syncedAt.toISOString(),
      };
    } catch (err) {
      this.logSpotFailure('syncCatalog', err);
      const message =
        err instanceof BadRequestException
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Falha ao sincronizar catálogo SPOT.';
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
          `Não foi possível gravar status de sync SPOT: ${
            persistErr instanceof Error
              ? persistErr.message
              : String(persistErr)
          }`,
        );
      }
      return {
        ok: false,
        skipped: false,
        message: `Falha na sincronização SPOT. Catálogo anterior mantido. ${message}`,
        upserted: 0,
        lastSyncAt: control.lastSyncAt?.toISOString() ?? null,
      };
    }
  }

  /**
   * Cria pedido na SPOT. LineType SIMPLE ou PRINT conforme gravação/arte.
   */
  async createOrder(orderData: SpotOrderPayload): Promise<unknown> {
    if (!this.isConfigured()) {
      throw new BadRequestException(
        'Configure as credenciais SPOT no servidor para sincronizar este fornecedor.',
      );
    }

    try {
      const token = await this.getValidToken();
      const lines = (orderData.lines ?? []).map((line) => {
        const hasPrint = Boolean(
          line.engraving?.trim() || line.artworkBase64?.trim(),
        );
        if (hasPrint && !line.artworkBase64?.trim()) {
          throw new BadRequestException(
            `Linha ${line.sku}: gravação PRINT exige arquivo de arte em base64.`,
          );
        }

        if (!hasPrint) {
          return {
            LineType: 'SIMPLE',
            Sku: line.sku,
            Quantity: line.quantity,
          };
        }

        const fileName = line.artworkFileName?.trim() || 'artwork';
        const extension =
          fileName.includes('.')
            ? fileName.split('.').pop() || 'bin'
            : line.artworkMimeType?.includes('pdf')
              ? 'pdf'
              : 'png';

        return {
          LineType: 'PRINT',
          Sku: line.sku,
          Quantity: line.quantity,
          WaitArtWork: false,
          ServiceOrderLines: [
            {
              Appproved: true,
              LogoArea: line.logoArea ?? null,
              LogoHeight: line.logoHeight ?? null,
              LogoWidth: line.logoWidth ?? null,
              ServCode: line.serviceCode ?? null,
              Files: {
                ServiceFileV1: {
                  FileName: fileName.replace(/\.[^.]+$/, ''),
                  FileExtension: extension,
                  FileBytes: line.artworkBase64,
                },
              },
            },
          ],
        };
      });

      return await this.request('POST', 'OrderV1', {
        token,
        data: {
          OrderLines: lines,
          Destination: orderData.destination ?? null,
          Courier: orderData.courier ?? null,
          Observations: orderData.observations ?? null,
          InternalReference: orderData.internalReference ?? null,
          Test: orderData.test ?? true,
        },
      });
    } catch (err) {
      this.logSpotFailure('createOrder', err);
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(
        'SPOT: falha ao criar pedido. Verifique credenciais e payload.',
      );
    }
  }

  async cancelOrder(orderStamp: string, reason: string): Promise<unknown> {
    if (!this.isConfigured()) {
      throw new BadRequestException(
        'Configure as credenciais SPOT no servidor para sincronizar este fornecedor.',
      );
    }
    try {
      const token = await this.getValidToken();
      return await this.request('POST', 'CancelOrderV1', {
        token,
        data: {
          OrderStamp: orderStamp,
          Reason: reason,
        },
      });
    } catch (err) {
      this.logSpotFailure('cancelOrder', err);
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(
        'SPOT: falha ao cancelar pedido. Verifique credenciais e OrderStamp.',
      );
    }
  }

  async listEngravingOptions(productSku: string) {
    const rows = await this.prisma.client.quoteCatalogEngravingOption.findMany({
      where: { productSku, supplier: SUPPLIER },
      orderBy: { techniqueName: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      productSku: row.productSku,
      supplier: row.supplier,
      techniqueName: row.techniqueName,
      price: row.price?.toString() ?? null,
      maxWidth: row.maxWidth?.toString() ?? null,
      maxHeight: row.maxHeight?.toString() ?? null,
    }));
  }
}
