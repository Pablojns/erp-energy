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
/** Margem de segurança antes do vencimento armazenado (ms). */
const TOKEN_SKEW_MS = 60_000;
/**
 * Validade máxima local do token SPOT (sessões curtas / ErrorCode 22).
 * Mesmo que a API não informe expiry, não reutilizamos além disso.
 */
const MAX_TOKEN_TTL_MS = 5 * 60_000;
/** Validade padrão quando a API não informa expiração. */
const DEFAULT_TOKEN_TTL_MS = MAX_TOKEN_TTL_MS;
/** ErrorCode SPOT para sessão inválida/expirada. */
const SPOT_INVALID_SESSION_CODE = '22';
/** Tentativas para 502/503/rede (inclui a primeira). */
const SPOT_NETWORK_RETRY_ATTEMPTS = 3;
/** Delay entre retries de rede/servidor (ms). */
const SPOT_NETWORK_RETRY_DELAY_MS = 2_000;

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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** 502/503/504, timeout ou falha de rede — retryável. */
  private isTransientSpotError(err: unknown): boolean {
    const axiosErr = err as AxiosError | undefined;
    const status = axiosErr?.response?.status;
    if (status === 502 || status === 503 || status === 504) return true;

    const code = axiosErr?.code ?? (err as { code?: string } | undefined)?.code;
    if (
      code === 'ECONNRESET' ||
      code === 'ECONNREFUSED' ||
      code === 'ENOTFOUND' ||
      code === 'ETIMEDOUT' ||
      code === 'EAI_AGAIN' ||
      code === 'ERR_NETWORK' ||
      code === 'ECONNABORTED'
    ) {
      return true;
    }

    const detail =
      err instanceof Error ? err.message : typeof err === 'string' ? err : String(err);
    if (/status code 502|status code 503|status code 504|timeout|network/i.test(detail)) {
      return true;
    }

    // Sem response HTTP = falha de transporte
    if (axiosErr && !axiosErr.response && axiosErr.request) return true;

    return false;
  }

  /** Erro real de autenticação/credenciais (não rede/502). */
  private isCredentialSpotError(err: unknown): boolean {
    if (this.isTransientSpotError(err)) return false;
    const axiosErr = err as AxiosError | undefined;
    const status = axiosErr?.response?.status;
    if (status === 401 || status === 403) return true;

    const body = axiosErr?.response?.data;
    const detail =
      err instanceof Error ? err.message : typeof err === 'string' ? err : String(err);
    if (
      /invalid.*(key|credential|access)|access.?key|unauthor|credencial/i.test(
        detail,
      )
    ) {
      return true;
    }
    if (typeof body === 'string' && /invalid|unauthor|credencial/i.test(body)) {
      return true;
    }
    if (
      body &&
      typeof body === 'object' &&
      /invalid|unauthor|credencial/i.test(JSON.stringify(body))
    ) {
      return true;
    }
    return false;
  }

  private logSpotFailure(context: string, err: unknown): void {
    const detail =
      err instanceof Error ? err.message : typeof err === 'string' ? err : String(err);

    if (this.isTransientSpotError(err)) {
      this.logger.error(
        `SPOT: servidor temporariamente indisponível (${context}): ${detail}`,
      );
      return;
    }

    if (this.isCredentialSpotError(err)) {
      this.logger.error(`SPOT: Credenciais SPOT inválidas (${context}): ${detail}`);
      return;
    }

    this.logger.error(`SPOT: falha em ${context}: ${detail}`);
  }

  private extractSpotErrorCode(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null;
    const raw =
      (data as Record<string, unknown>).ErrorCode ??
      (data as Record<string, unknown>).errorCode;
    if (
      raw === null ||
      raw === undefined ||
      raw === '' ||
      raw === 0 ||
      raw === '0'
    ) {
      return null;
    }
    return String(raw).trim();
  }

  private isInvalidSessionResponse(data: unknown): boolean {
    return this.extractSpotErrorCode(data) === SPOT_INVALID_SESSION_CODE;
  }

  private async request<T = unknown>(
    method: 'GET' | 'POST',
    path: string,
    options?: {
      params?: Record<string, string | number | boolean | undefined | null>;
      data?: unknown;
      token?: string;
      timeoutMs?: number;
      /** Evita loop infinito no retry de ErrorCode 22. */
      _retriedInvalidSession?: boolean;
    },
  ): Promise<T> {
    const cleanPath = path.replace(/^\//, '');
    const url = `${this.getBaseUrl()}/${cleanPath}`;
    const params: Record<string, string | number | boolean> = {};
    if (options?.token) params.token = options.token;
    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value === undefined || value === null || value === '') continue;
        params[key] = value;
      }
    }

    const isProductsDiag = cleanPath.toLowerCase() === 'products';
    let lastTransientError: unknown;

    for (
      let attempt = 1;
      attempt <= SPOT_NETWORK_RETRY_ATTEMPTS;
      attempt += 1
    ) {
      try {
        const response = await axios.request({
          method,
          url,
          params,
          data: options?.data,
          timeout: options?.timeoutMs ?? 120_000,
          validateStatus: (status) => status >= 200 && status < 300,
          ...(isProductsDiag
            ? {
                // Captura body bruto (antes do parse) para diagnóstico
                responseType: 'text' as const,
                transformResponse: [(data: unknown) => data],
              }
            : {}),
        });

        let data: unknown = response.data;

        if (isProductsDiag) {
          const rawBody =
            typeof response.data === 'string'
              ? response.data
              : JSON.stringify(response.data ?? '');
          const finalUrl = axios.getUri({ url, params });
          const requestHeaders = response.config.headers ?? {};
          this.logger.warn(
            [
              'SPOT /products raw diagnostic',
              `status=${response.status}`,
              `url=${finalUrl}`,
              `requestHeaders=${JSON.stringify(requestHeaders)}`,
              `responseHeaders=${JSON.stringify(response.headers ?? {})}`,
              `bodyLength=${rawBody.length}`,
              `bodyPreview=${rawBody.slice(0, 500)}`,
            ].join(' | '),
          );

          if (!rawBody.trim()) {
            data = response.data;
          } else {
            try {
              data = JSON.parse(rawBody);
            } catch {
              this.logger.warn(
                `SPOT /products: body não é JSON válido. content-type=${String(response.headers?.['content-type'] ?? '')}`,
              );
              data = rawBody;
            }
          }
        }

        const canRetryInvalidSession =
          Boolean(options?.token) &&
          !options?._retriedInvalidSession &&
          cleanPath.toLowerCase() !== 'authenticateclient' &&
          this.isInvalidSessionResponse(data);

        if (canRetryInvalidSession) {
          this.logger.warn(
            `SPOT: ErrorCode ${SPOT_INVALID_SESSION_CODE} (Invalid session) em ${cleanPath} — re-autenticando e repetindo uma vez`,
          );
          const auth = await this.authenticate();
          return this.request<T>(method, path, {
            ...options,
            token: auth.token,
            _retriedInvalidSession: true,
          });
        }

        return data as T;
      } catch (err) {
        lastTransientError = err;
        const canRetryNetwork =
          this.isTransientSpotError(err) &&
          attempt < SPOT_NETWORK_RETRY_ATTEMPTS;

        if (canRetryNetwork) {
          this.logger.warn(
            `SPOT: Servidor SPOT temporariamente indisponível, tentando novamente... (${cleanPath} ${attempt}/${SPOT_NETWORK_RETRY_ATTEMPTS})`,
          );
          await this.sleep(SPOT_NETWORK_RETRY_DELAY_MS);
          continue;
        }

        throw err;
      }
    }

    throw lastTransientError;
  }

  private capTokenExpiry(expiresAt: Date): Date {
    const max = new Date(Date.now() + MAX_TOKEN_TTL_MS);
    return expiresAt.getTime() > max.getTime() ? max : expiresAt;
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

      const errorCode = this.extractSpotErrorCode(data);
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

      const expiresAt = this.capTokenExpiry(this.parseExpiry(data));

      await this.prisma.client.$transaction(async (tx) => {
        await tx.spotSession.deleteMany({});
        await tx.spotSession.create({
          data: { token, expiresAt },
        });
      });

      this.logger.log(
        `SPOT: token gerado — válido até ${expiresAt.toISOString()} (TTL máx. local ${MAX_TOKEN_TTL_MS / 60_000} min)`,
      );
      return { token, expiresAt };
    } catch (err) {
      this.logSpotFailure('authenticate', err);
      if (err instanceof BadRequestException) throw err;
      if (this.isTransientSpotError(err)) {
        throw new BadRequestException(
          'Servidor SPOT temporariamente indisponível. Tente novamente em instantes.',
        );
      }
      throw new BadRequestException(
        'Credenciais SPOT inválidas. Verifique SPOT_ACCESS_KEY.',
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
      this.logger.log(
        `SPOT: reutilizando token válido até ${session.expiresAt.toISOString()}`,
      );
      return session.token;
    }

    if (session) {
      this.logger.warn(
        `SPOT: token expirado ou próximo do vencimento (expiresAt=${session.expiresAt.toISOString()}) — gerando novo`,
      );
    } else {
      this.logger.log('SPOT: nenhuma sessão salva — gerando novo token');
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
      'ProdReference',
      'prodReference',
      'ProductReference',
      'productReference',
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

  /**
   * Preço unitário SPOT: YourPrice / ScalePrices (productsTree) ou Price/CatalogPrice.
   */
  private extractUnitPrice(row: Record<string, unknown>): number {
    const direct = this.toNumber(
      row.YourPrice ??
        row.yourPrice ??
        row.Price ??
        row.price ??
        row.SalePrice ??
        row.salePrice ??
        row.CatalogPrice ??
        row.catalogPrice ??
        row.UnitPrice ??
        row.unitPrice ??
        row.NetPrice ??
        row.netPrice ??
        row.Pvp ??
        row.pvp,
      NaN,
    );
    if (Number.isFinite(direct) && direct > 0) return direct;

    const scales = row.ScalePrices ?? row.scalePrices;
    if (Array.isArray(scales)) {
      for (const tier of scales) {
        if (!tier || typeof tier !== 'object') continue;
        const t = tier as Record<string, unknown>;
        const tierPrice = this.toNumber(
          t.Price ?? t.price ?? t.YourPrice ?? t.yourPrice,
          NaN,
        );
        if (Number.isFinite(tierPrice) && tierPrice > 0) return tierPrice;
      }
    }

    return NaN;
  }

  private buildPriceMap(
    prices: Record<string, unknown>[],
  ): Map<string, number> {
    const map = new Map<string, number>();
    for (const row of prices) {
      const sku = this.extractSku(row);
      if (!sku) continue;
      const price = this.extractUnitPrice(row);
      if (Number.isFinite(price)) map.set(sku, price);
    }
    return map;
  }

  /**
   * /Stocks.Sku vem como "11103-103" (ref-cor); o catálogo usa ProdReference "11103".
   */
  private toCatalogStockKey(sku: string): string {
    const t = sku.trim();
    const leadingDigits = t.match(/^(\d+)/);
    if (leadingDigits) return leadingDigits[1];
    const dash = t.indexOf('-');
    if (dash > 0) return t.slice(0, dash).trim();
    return t;
  }

  private buildStockMap(
    stocks: Record<string, unknown>[],
  ): Map<string, number> {
    const map = new Map<string, number>();
    for (const row of stocks) {
      // Preferir Sku/WebSku da linha de estoque (ProdReference não existe em /Stocks)
      const variantSku =
        this.pickString(row, [
          'Sku',
          'sku',
          'WebSku',
          'webSku',
          'SKU',
          'ProdReference',
          'prodReference',
          'Reference',
          'reference',
        ]) ?? this.extractSku(row);
      if (!variantSku) continue;
      const catalogKey = this.toCatalogStockKey(variantSku);
      const qty = this.toInt(
        row.Quantity ??
          row.quantity ??
          row.Stock ??
          row.stock ??
          row.Available ??
          row.available ??
          row.StockAvailable ??
          row.stockAvailable ??
          row.AvailableQty ??
          row.availableQty ??
          row.Qty ??
          row.qty,
        NaN,
      );
      if (!Number.isFinite(qty)) continue;
      // Somar variantes de cor no mesmo ProdReference
      map.set(catalogKey, (map.get(catalogKey) ?? 0) + qty);
    }
    return map;
  }

  private parseAreaMm(area: string | null): {
    maxWidth: Prisma.Decimal | null;
    maxHeight: Prisma.Decimal | null;
  } {
    if (!area) return { maxWidth: null, maxHeight: null };
    const m = area.match(
      /(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)/,
    );
    if (!m) return { maxWidth: null, maxHeight: null };
    return {
      maxWidth: this.toOptionalDecimal(m[1]),
      maxHeight: this.toOptionalDecimal(m[2]),
    };
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
    const seen = new Set<string>();

    const pushOption = (
      productSku: string,
      techniqueName: string,
      price: Prisma.Decimal | null,
      maxWidth: Prisma.Decimal | null,
      maxHeight: Prisma.Decimal | null,
    ) => {
      const name = techniqueName.trim();
      if (!name) return;
      const key = `${productSku}::${name.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        productSku,
        techniqueName: name,
        price,
        maxWidth,
        maxHeight,
      });
    };

    const parseHandlingCostValue = (value: unknown): Prisma.Decimal | null => {
      if (value == null || value === '') return null;
      // SPOT pode enviar "0.0" ou "0.0, 0.0" (um custo por técnica na mesma célula)
      if (typeof value === 'string' && /[,;]/.test(value)) {
        const first = value.split(/[,;]/)[0]?.trim();
        return this.toOptionalDecimal(first);
      }
      return this.toOptionalDecimal(value);
    };

    const priceFromHandling = (
      raw: Record<string, unknown>,
      index?: number,
    ): Prisma.Decimal | null => {
      if (index != null) {
        const indexed =
          raw[`HandlingCosts${index}`] ??
          raw[`HandlingCost${index}`] ??
          raw[`handlingCosts${index}`];
        const fromIndexed = parseHandlingCostValue(indexed);
        if (fromIndexed != null) return fromIndexed;
      }
      return parseHandlingCostValue(
        raw.HandlingCosts ??
          raw.handlingCosts ??
          raw.DefaultCustomizationHandlingCosts ??
          raw.defaultCustomizationHandlingCosts ??
          raw.Price ??
          raw.price ??
          raw.UnitPrice ??
          raw.unitPrice ??
          raw.Cost ??
          raw.cost,
      );
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
          if (!item || typeof item !== 'object') continue;
          const opt = item as Record<string, unknown>;
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
          if (!techniqueName) continue;
          pushOption(
            productSku,
            techniqueName,
            priceFromHandling(opt),
            this.toOptionalDecimal(
              opt.MaxWidth ??
                opt.maxWidth ??
                opt.LogoWidth ??
                opt.logoWidth ??
                opt.Width ??
                opt.width,
            ),
            this.toOptionalDecimal(
              opt.MaxHeight ??
                opt.maxHeight ??
                opt.LogoHeight ??
                opt.logoHeight ??
                opt.Height ??
                opt.height,
            ),
          );
        }
      }
      if (foundNested) continue;

      // Formato real /optionalsComplete: CustomizationTypes1..N + HandlingCosts1..N
      let numbered = 0;
      for (let i = 1; i <= 20; i++) {
        const type = this.pickString(row, [
          `CustomizationTypes${i}`,
          `CustomizationType${i}`,
          `customizationTypes${i}`,
        ]);
        if (!type) continue;
        numbered += 1;
        const area =
          this.pickString(row, [
            `Area${i}`,
            `area${i}`,
            'ProductComponentDefaultLocationAreaMM',
            'productComponentDefaultLocationAreaMM',
          ]) ?? null;
        const dims = this.parseAreaMm(area);
        pushOption(
          productSku,
          type,
          priceFromHandling(row, i),
          dims.maxWidth,
          dims.maxHeight,
        );
      }
      if (numbered > 0) continue;

      // CustomizationTypes = "Laser, Tampografia, ..."
      const typesCsv = this.pickString(row, [
        'CustomizationTypes',
        'customizationTypes',
      ]);
      if (typesCsv) {
        const defaultPrice = priceFromHandling(row);
        const area =
          this.pickString(row, [
            'ProductComponentDefaultLocationAreaMM',
            'productComponentDefaultLocationAreaMM',
            'Area1',
            'area1',
          ]) ?? null;
        const dims = this.parseAreaMm(area);
        for (const part of typesCsv.split(/[,;|]/)) {
          pushOption(
            productSku,
            part,
            defaultPrice,
            dims.maxWidth,
            dims.maxHeight,
          );
        }
        continue;
      }

      // Legado: Name/Technique + Price (nunca usar Name do produto como técnica)
      const techniqueName = this.pickString(row, [
        'TechniqueName',
        'techniqueName',
        'Technique',
        'technique',
        'ServiceName',
        'serviceName',
        'OptionalName',
        'optionalName',
        'Customization',
        'customization',
      ]);
      if (!techniqueName) continue;
      const dims = this.parseAreaMm(
        this.pickString(row, [
          'ProductComponentDefaultLocationAreaMM',
          'productComponentDefaultLocationAreaMM',
          'Area1',
          'area1',
          'Dimensions',
          'dimensions',
        ]),
      );
      pushOption(
        productSku,
        techniqueName,
        priceFromHandling(row),
        dims.maxWidth ??
          this.toOptionalDecimal(
            row.MaxWidth ?? row.maxWidth ?? row.Width ?? row.width,
          ),
        dims.maxHeight ??
          this.toOptionalDecimal(
            row.MaxHeight ?? row.maxHeight ?? row.Height ?? row.height,
          ),
      );
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

      const priceFromRow = this.extractUnitPrice(row);
      const fromMap = priceMap.get(supplierCode);
      const salePrice = new Prisma.Decimal(
        Number.isFinite(priceFromRow)
          ? priceFromRow
          : fromMap != null && Number.isFinite(fromMap)
            ? fromMap
            : 0,
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
      // Preferir mapa de /Stocks (agregado por ProdReference); linha do produto
      // frequentemente traz Quantity/Stock zerados ou de outra unidade.
      const fromStockMap = stockMap.get(supplierCode);
      const availableQty =
        fromStockMap != null
          ? fromStockMap
          : Number.isFinite(stockFromRow)
            ? stockFromRow
            : 0;

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

    void options?.force;

    let rawList: Record<string, unknown>[] = [];
    let catalogPrices: Record<string, unknown>[] = [];
    let optionalsComplete: Record<string, unknown>[] = [];
    let stocks: Record<string, unknown>[] = [];
    let priceMap = new Map<string, number>();
    let syncToken: string | null = null;

    try {
      // Uma autenticação + uma carga de produtos (padrão simples como XBZ).
      // Retry 502/503/504 fica em request() — sem re-auth entre lotes.
      const { token, expiresAt } = await this.authenticate();
      syncToken = token;
      this.logger.log(
        `SPOT syncCatalog: token até ${expiresAt.toISOString()}`,
      );

      const productsData = await this.request('GET', 'products', {
        token,
        params: { lang: 'PT' },
        timeoutMs: 180_000,
      });
      rawList = this.unwrapList(productsData);

      const [pricesRaw, optionalsData, stocksData] = await Promise.all([
        this.request('GET', 'catalogPrices', { token }).catch((err) => {
          this.logSpotFailure('catalogPrices', err);
          return null;
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

      // Log temporário — estrutura real de /catalogPrices
      if (pricesRaw != null) {
        const rawPreview = JSON.stringify(pricesRaw).slice(0, 1000);
        this.logger.warn(
          `SPOT /catalogPrices raw diagnostic | bodyPreview=${rawPreview}`,
        );
        catalogPrices = this.unwrapList(pricesRaw);
      }
      optionalsComplete = optionalsData;
      stocks = stocksData;

      // Log temporário — primeiros 3 registros brutos de /Stocks
      this.logger.warn(
        `SPOT /Stocks raw diagnostic (first 3) | ${JSON.stringify(
          stocks.slice(0, 3),
        )}`,
      );
      // Log temporário — primeiros 3 registros brutos de /optionalsComplete (todos os campos)
      this.logger.warn(
        `SPOT /optionalsComplete raw diagnostic (first 3) | ${JSON.stringify(
          optionalsComplete.slice(0, 3),
        )}`,
      );

      priceMap = this.buildPriceMap(catalogPrices);
      this.logger.log(
        `SPOT sync: catalogPrices mapeados=${priceMap.size} (lista=${catalogPrices.length})`,
      );

      // /catalogPrices frequentemente vem vazio; preços estão em productsTree.YourPrice
      if (priceMap.size === 0 && syncToken) {
        this.logger.warn(
          'SPOT sync: catalogPrices sem preços — buscando YourPrice em productsTree',
        );
        const treeData = await this.request('GET', 'productsTree', {
          token: syncToken,
          params: { lang: 'PT' },
          timeoutMs: 180_000,
        });
        const treeList = this.unwrapList(treeData);
        priceMap = this.buildPriceMap(treeList);
        this.logger.log(
          `SPOT sync: prices via productsTree mapeados=${priceMap.size} (YourPrice/ScalePrices)`,
        );
        // productsTree traz YourPrice na linha — preferir como fonte de produtos
        if (treeList.length > 0) {
          rawList = treeList;
        }
      }
    } catch (err) {
      this.logSpotFailure('syncCatalog', err);
      const message =
        err instanceof BadRequestException
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Falha ao consultar API SPOT.';
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

    const stockMap = this.buildStockMap(stocks);
    const normalized = this.normalizeProducts(rawList, priceMap, stockMap);
    const withPrice = normalized.filter((p) => Number(p.salePrice) > 0).length;
    this.logger.log(
      `SPOT sync: normalizados=${normalized.length}, com preço>0=${withPrice}`,
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

    try {
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
      // Remove opções antigas (ex.: techniqueName = nome do produto, price null)
      await this.prisma.client.quoteCatalogEngravingOption.deleteMany({
        where: { supplier: SUPPLIER },
      });
      for (const option of engravingOptions) {
        await this.prisma.client.quoteCatalogEngravingOption.create({
          data: {
            productSku: option.productSku,
            supplier: SUPPLIER,
            techniqueName: option.techniqueName,
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
      const message =
        err instanceof Error ? err.message : 'Erro ao gravar catálogo SPOT.';
      this.logger.error(`Persistência do catálogo SPOT falhou: ${message}`);
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
        message: `Erro ao salvar catálogo SPOT. ${message}`,
        upserted,
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
