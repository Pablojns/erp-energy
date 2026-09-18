import * as fs from 'fs';
import * as https from 'https';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import type { BankCredit } from './bank-credits';
import {
  INTER_API_BASE,
  INTER_DEFAULT_SCOPES,
  INTER_EXTRATO_COMPLETO_PATH,
  INTER_EXTRATO_PATH,
  INTER_SALDO_PATH,
  INTER_SESSION_ID,
  INTER_TOKEN_SKEW_MS,
  INTER_TOKEN_URL,
  chunkDateRange,
  expiryFromExpiresIn,
  isAccessTokenExpired,
  ymdUtc,
  type InterTokenResponse,
} from './inter.auth';
import {
  mapInterExtratoToBankCredits,
  type InterExtratoResponse,
  type InterSaldoResponse,
} from './inter.extrato';

type StoredInterSession = {
  accessToken: string;
  tokenType: string;
  scope: string | null;
  expiresAt: Date;
};

/**
 * Cliente HTTP autenticado do Banco Inter (OAuth2 client_credentials + mTLS).
 * Extrato/Saldo hoje; Pix Cobrança/Pagamento reutilizam `apiGet`/`apiPost` depois.
 */
@Injectable()
export class InterIntegrationService {
  private readonly logger = new Logger(InterIntegrationService.name);
  private refreshInFlight: Promise<StoredInterSession> | null = null;
  private httpsAgent: https.Agent | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  isConfigured(): boolean {
    try {
      this.clientId();
      this.clientSecret();
      this.certPath();
      this.keyPath();
      return true;
    } catch {
      return false;
    }
  }

  /** Status leve para health/debug. */
  async status(): Promise<{
    configured: boolean;
    hasSession: boolean;
    expiresAt: string | null;
    scope: string | null;
  }> {
    const configured = this.isConfigured();
    if (!configured) {
      return {
        configured: false,
        hasSession: false,
        expiresAt: null,
        scope: null,
      };
    }
    const session = await this.loadSession();
    return {
      configured: true,
      hasSession: Boolean(session?.accessToken),
      expiresAt: session?.expiresAt?.toISOString() ?? null,
      scope: session?.scope ?? null,
    };
  }

  async ensureToken(): Promise<StoredInterSession> {
    return this.getValidSession();
  }

  async getSaldo(dataSaldo?: Date): Promise<InterSaldoResponse> {
    const params: Record<string, string> = {};
    if (dataSaldo) params.dataSaldo = ymdUtc(dataSaldo);
    return (await this.apiGet(INTER_SALDO_PATH, params)) as InterSaldoResponse;
  }

  /**
   * Extrato completo no intervalo, quebrando em janelas ≤90 dias.
   * Retorna créditos mapeados para `BankCredit` (fonte INTER_API).
   */
  async fetchExtratoCredits(
    dataInicio: Date,
    dataFim: Date,
  ): Promise<{
    credits: BankCredit[];
    rawTransactionCount: number;
    chunks: Array<{ inicio: string; fim: string; count: number }>;
    path: string;
  }> {
    const windows = chunkDateRange(dataInicio, dataFim);
    if (windows.length === 0) {
      return {
        credits: [],
        rawTransactionCount: 0,
        chunks: [],
        path: INTER_EXTRATO_PATH,
      };
    }
    const allRaw: InterExtratoResponse['transacoes'] = [];
    const chunks: Array<{ inicio: string; fim: string; count: number }> = [];
    for (const w of windows) {
      const list = await this.fetchExtratoWindow(w.inicio, w.fim);
      allRaw.push(...list);
      chunks.push({
        inicio: ymdUtc(w.inicio),
        fim: ymdUtc(w.fim),
        count: list.length,
      });
    }
    const credits = mapInterExtratoToBankCredits({ transacoes: allRaw });
    return {
      credits,
      rawTransactionCount: allRaw.length,
      chunks,
      path: INTER_EXTRATO_COMPLETO_PATH,
    };
  }

  /**
   * Prefere `/extrato/completo` (paginado). Fallback para `/extrato` simples.
   */
  private async fetchExtratoWindow(
    inicio: Date,
    fim: Date,
  ): Promise<NonNullable<InterExtratoResponse['transacoes']>> {
    const dataInicio = ymdUtc(inicio);
    const dataFim = ymdUtc(fim);
    try {
      const out: NonNullable<InterExtratoResponse['transacoes']> = [];
      let pagina = 0;
      for (;;) {
        const payload = (await this.apiGet(INTER_EXTRATO_COMPLETO_PATH, {
          dataInicio,
          dataFim,
          pagina,
          tamanhoPagina: 1000,
        })) as InterExtratoResponse & {
          ultimaPagina?: boolean;
          totalPaginas?: number;
          transacoes?: InterExtratoResponse['transacoes'];
        };
        const list = Array.isArray(payload?.transacoes) ? payload.transacoes : [];
        out.push(...list);
        const last =
          payload?.ultimaPagina === true ||
          (typeof payload?.totalPaginas === 'number' &&
            pagina + 1 >= payload.totalPaginas) ||
          list.length === 0;
        if (last) break;
        pagina += 1;
        if (pagina > 50) break;
      }
      return out;
    } catch (err) {
      this.logger.warn(
        `extrato/completo falhou (${dataInicio}→${dataFim}); fallback /extrato: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      const payload = (await this.apiGet(INTER_EXTRATO_PATH, {
        dataInicio,
        dataFim,
      })) as InterExtratoResponse;
      return Array.isArray(payload?.transacoes) ? payload.transacoes! : [];
    }
  }

  /** GET autenticado (mTLS + Bearer). Base reutilizável para Pix depois. */
  async apiGet(
    path: string,
    params?: Record<string, string | number | boolean>,
  ): Promise<unknown> {
    const session = await this.getValidSession();
    try {
      return await this.rawRequest('GET', path, session.accessToken, {
        params,
      });
    } catch (err) {
      const ax = err as AxiosError;
      if (ax.response?.status !== 401) throw err;
      const refreshed = await this.refreshStoredToken({
        force: true,
        rejectAccessToken: session.accessToken,
      });
      return this.rawRequest('GET', path, refreshed.accessToken, { params });
    }
  }

  /** POST autenticado — preparado para Pix Cobrança/Pagamento. */
  async apiPost(path: string, body?: unknown): Promise<unknown> {
    const session = await this.getValidSession();
    try {
      return await this.rawRequest('POST', path, session.accessToken, {
        data: body,
      });
    } catch (err) {
      const ax = err as AxiosError;
      if (ax.response?.status !== 401) throw err;
      const refreshed = await this.refreshStoredToken({
        force: true,
        rejectAccessToken: session.accessToken,
      });
      return this.rawRequest('POST', path, refreshed.accessToken, {
        data: body,
      });
    }
  }

  private async rawRequest(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    accessToken: string,
    opts: { params?: Record<string, string | number | boolean>; data?: unknown } = {},
  ): Promise<unknown> {
    const url = path.startsWith('http')
      ? path
      : `${INTER_API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    };
    const conta = this.contaCorrente();
    if (conta) headers['x-conta-corrente'] = conta;
    if (opts.data !== undefined) headers['Content-Type'] = 'application/json';

    try {
      const res = await axios.request({
        method,
        url,
        params: opts.params,
        data: opts.data,
        headers,
        httpsAgent: this.getHttpsAgent(),
        timeout: 45_000,
        validateStatus: (s) => s >= 200 && s < 300,
      } satisfies AxiosRequestConfig);
      return res.data;
    } catch (err) {
      const ax = err as AxiosError;
      if (ax.response?.status === 401) throw err;
      throw new ServiceUnavailableException(
        `Inter API ${method} ${path}: ${this.axiosMessage(ax)}`,
      );
    }
  }

  private async getValidSession(): Promise<StoredInterSession> {
    if (!this.isConfigured()) {
      throw new BadRequestException(
        'Banco Inter não configurado. Defina INTER_CLIENT_ID, INTER_CLIENT_SECRET, INTER_CERT_PATH e INTER_KEY_PATH.',
      );
    }
    const session = await this.loadSession();
    if (session && !isAccessTokenExpired(session.expiresAt, new Date(), INTER_TOKEN_SKEW_MS)) {
      return session;
    }
    return this.refreshStoredToken();
  }

  private async refreshStoredToken(opts?: {
    force?: boolean;
    rejectAccessToken?: string;
  }): Promise<StoredInterSession> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.doRefreshStoredToken(opts).finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private canReuseAccess(
    session: StoredInterSession,
    opts?: { force?: boolean; rejectAccessToken?: string },
  ): boolean {
    if (
      opts?.force &&
      opts.rejectAccessToken &&
      session.accessToken === opts.rejectAccessToken
    ) {
      return false;
    }
    return !isAccessTokenExpired(
      session.expiresAt,
      new Date(),
      INTER_TOKEN_SKEW_MS,
    );
  }

  private async doRefreshStoredToken(opts?: {
    force?: boolean;
    rejectAccessToken?: string;
  }): Promise<StoredInterSession> {
    const deadline = Date.now() + 20_000;
    let locked = false;
    while (Date.now() < deadline) {
      const waiting = await this.loadSession();
      if (waiting && this.canReuseAccess(waiting, opts)) {
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
        'Timeout ao renovar token do Inter (outra renovação em andamento). Tente de novo.',
      );
    }
    try {
      const existing = await this.loadSession();
      if (existing && this.canReuseAccess(existing, opts)) {
        return existing;
      }
      const tokens = await this.fetchClientCredentialsToken();
      return await this.persistSession(tokens);
    } finally {
      await this.releaseRefreshLock();
    }
  }

  private async fetchClientCredentialsToken(): Promise<InterTokenResponse> {
    const body = new URLSearchParams({
      client_id: this.clientId(),
      client_secret: this.clientSecret(),
      grant_type: 'client_credentials',
      scope: this.scopes(),
    }).toString();

    try {
      const res = await axios.post<InterTokenResponse>(INTER_TOKEN_URL, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        httpsAgent: this.getHttpsAgent(),
        timeout: 20_000,
        validateStatus: (s) => s >= 200 && s < 300,
      });
      if (!res.data?.access_token) {
        throw new ServiceUnavailableException(
          'Banco Inter não devolveu access_token.',
        );
      }
      this.logger.log(
        `Token Inter obtido (expira em ~${res.data.expires_in ?? 3600}s).`,
      );
      return res.data;
    } catch (err) {
      const msg = this.axiosMessage(err as AxiosError);
      await this.recordLastError(msg);
      throw new ServiceUnavailableException(
        `Falha OAuth Inter: ${msg}`,
      );
    }
  }

  private async persistSession(
    tokens: InterTokenResponse,
  ): Promise<StoredInterSession> {
    const expiresInSec =
      Number.isFinite(tokens.expires_in) && (tokens.expires_in ?? 0) > 0
        ? Number(tokens.expires_in)
        : 3600;
    const session: StoredInterSession = {
      accessToken: tokens.access_token,
      tokenType: tokens.token_type || 'Bearer',
      scope: tokens.scope ?? this.scopes(),
      expiresAt: expiryFromExpiresIn(expiresInSec),
    };
    // Grava o instante em UTC “naive” (Prisma DateTime = TIMESTAMP without TZ).
    const expiresUtc = session.expiresAt
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d{3}Z$/, '')
      .replace(/Z$/, '');
    await this.prisma.client.$executeRaw`
      INSERT INTO "InterSession" (
        "id", "accessToken", "tokenType", "scope", "expiresAt",
        "refreshLockUntil", "lastError", "createdAt", "updatedAt"
      )
      VALUES (
        ${INTER_SESSION_ID},
        ${session.accessToken},
        ${session.tokenType},
        ${session.scope},
        ${expiresUtc}::timestamp,
        NULL,
        NULL,
        NOW(),
        NOW()
      )
      ON CONFLICT ("id") DO UPDATE SET
        "accessToken" = EXCLUDED."accessToken",
        "tokenType" = EXCLUDED."tokenType",
        "scope" = EXCLUDED."scope",
        "expiresAt" = ${expiresUtc}::timestamp,
        "refreshLockUntil" = NULL,
        "lastError" = NULL,
        "updatedAt" = NOW()
    `;
    const loaded = await this.loadSession();
    if (loaded?.accessToken === session.accessToken) {
      return loaded;
    }
    return session;
  }

  private async loadSession(): Promise<StoredInterSession | null> {
    try {
      const rows = await this.prisma.client.$queryRaw<
        Array<{
          accessToken: string;
          tokenType: string;
          scope: string | null;
          expiresAt: Date;
        }>
      >`
        SELECT "accessToken", "tokenType", "scope", "expiresAt"
        FROM "InterSession"
        WHERE "id" = ${INTER_SESSION_ID}
        LIMIT 1
      `;
      const row = rows[0];
      if (!row?.accessToken) return null;
      return {
        accessToken: row.accessToken,
        tokenType: row.tokenType || 'Bearer',
        scope: row.scope,
        expiresAt: new Date(row.expiresAt),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/InterSession|does not exist/i.test(msg)) {
        this.logger.warn(
          'Tabela InterSession ausente — rode a migration antes de usar a API Inter.',
        );
        return null;
      }
      throw err;
    }
  }

  private async tryAcquireRefreshLock(): Promise<boolean> {
    try {
      const n = await this.prisma.client.$executeRaw`
        UPDATE "InterSession"
        SET "refreshLockUntil" = NOW() + INTERVAL '45 seconds',
            "updatedAt" = NOW()
        WHERE "id" = ${INTER_SESSION_ID}
          AND ("refreshLockUntil" IS NULL OR "refreshLockUntil" < NOW())
      `;
      if (Number(n) > 0) return true;
      // Sem linha ainda: cria placeholder e tenta de novo
      await this.prisma.client.$executeRaw`
        INSERT INTO "InterSession" (
          "id", "accessToken", "tokenType", "expiresAt",
          "refreshLockUntil", "createdAt", "updatedAt"
        )
        VALUES (
          ${INTER_SESSION_ID},
          '',
          'Bearer',
          NOW(),
          NOW() + INTERVAL '45 seconds',
          NOW(),
          NOW()
        )
        ON CONFLICT ("id") DO NOTHING
      `;
      const n2 = await this.prisma.client.$executeRaw`
        UPDATE "InterSession"
        SET "refreshLockUntil" = NOW() + INTERVAL '45 seconds',
            "updatedAt" = NOW()
        WHERE "id" = ${INTER_SESSION_ID}
          AND ("refreshLockUntil" IS NULL OR "refreshLockUntil" < NOW() OR "accessToken" = '')
      `;
      return Number(n2) > 0;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/InterSession|does not exist/i.test(msg)) {
        throw new ServiceUnavailableException(
          'Tabela InterSession ausente. Aplique a migration inter_session_cobranca.',
        );
      }
      throw err;
    }
  }

  private async releaseRefreshLock(): Promise<void> {
    try {
      await this.prisma.client.$executeRaw`
        UPDATE "InterSession"
        SET "refreshLockUntil" = NULL, "updatedAt" = NOW()
        WHERE "id" = ${INTER_SESSION_ID}
      `;
    } catch (err) {
      this.logger.warn(
        `Falha ao liberar lock Inter: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async recordLastError(msg: string): Promise<void> {
    try {
      await this.prisma.client.$executeRaw`
        UPDATE "InterSession"
        SET "lastError" = ${msg.slice(0, 2000)}, "updatedAt" = NOW()
        WHERE "id" = ${INTER_SESSION_ID}
      `;
    } catch {
      /* ignore */
    }
  }

  private getHttpsAgent(): https.Agent {
    if (this.httpsAgent) return this.httpsAgent;
    const cert = fs.readFileSync(this.certPath());
    const key = fs.readFileSync(this.keyPath());
    this.httpsAgent = new https.Agent({
      cert,
      key,
      keepAlive: true,
    });
    return this.httpsAgent;
  }

  private clientId(): string {
    const v = this.config.get<string>('INTER_CLIENT_ID')?.trim();
    if (!v) throw new BadRequestException('INTER_CLIENT_ID ausente.');
    return v;
  }

  private clientSecret(): string {
    const v = this.config.get<string>('INTER_CLIENT_SECRET')?.trim();
    if (!v) throw new BadRequestException('INTER_CLIENT_SECRET ausente.');
    return v;
  }

  private certPath(): string {
    const v = this.config.get<string>('INTER_CERT_PATH')?.trim();
    if (!v) throw new BadRequestException('INTER_CERT_PATH ausente.');
    if (!fs.existsSync(v)) {
      throw new BadRequestException(`Certificado Inter não encontrado: ${v}`);
    }
    return v;
  }

  private keyPath(): string {
    const v = this.config.get<string>('INTER_KEY_PATH')?.trim();
    if (!v) throw new BadRequestException('INTER_KEY_PATH ausente.');
    if (!fs.existsSync(v)) {
      throw new BadRequestException(`Chave Inter não encontrada: ${v}`);
    }
    return v;
  }

  private contaCorrente(): string {
    return (
      this.config.get<string>('INTER_CONTA_CORRENTE')?.replace(/\D/g, '') ?? ''
    );
  }

  private scopes(): string {
    return (
      this.config.get<string>('INTER_SCOPES')?.trim() || INTER_DEFAULT_SCOPES
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private axiosMessage(err: AxiosError | null | undefined): string {
    if (!err) return 'erro desconhecido';
    const data = err.response?.data;
    if (typeof data === 'string' && data.trim()) return data.trim().slice(0, 500);
    if (data && typeof data === 'object') {
      const rec = data as Record<string, unknown>;
      for (const k of ['message', 'error_description', 'error', 'title', 'detail']) {
        const v = rec[k];
        if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 500);
      }
      try {
        return JSON.stringify(data).slice(0, 500);
      } catch {
        /* ignore */
      }
    }
    return err.message || 'erro desconhecido';
  }
}
