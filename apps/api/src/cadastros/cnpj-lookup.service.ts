import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import axios, { type AxiosError } from 'axios';
import {
  mapBrasilApiCnpj,
  mapReceitaWsCnpj,
  type CnpjLookupResult,
} from './cnpj-lookup';

const USER_AGENT = 'ERP-Energy/1.0 (cadastros; contato@energybrands.com.br)';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class CnpjLookupService {
  private readonly cache = new Map<
    string,
    { expiresAt: number; value: CnpjLookupResult }
  >();

  async lookup(cnpjDigits: string): Promise<CnpjLookupResult> {
    const digits = cnpjDigits.replace(/\D/g, '');
    if (digits.length !== 14) {
      throw new BadRequestException('Informe um CNPJ com 14 dígitos.');
    }

    const cached = this.cache.get(digits);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const fromBrasilApi = await this.fetchBrasilApi(digits);
    if (fromBrasilApi) {
      this.cache.set(digits, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        value: fromBrasilApi,
      });
      return fromBrasilApi;
    }

    const fromReceitaWs = await this.fetchReceitaWs(digits);
    if (fromReceitaWs) {
      this.cache.set(digits, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        value: fromReceitaWs,
      });
      return fromReceitaWs;
    }

    throw new NotFoundException('CNPJ não encontrado na consulta pública.');
  }

  private async fetchBrasilApi(
    cnpj: string,
  ): Promise<CnpjLookupResult | null> {
    try {
      const res = await axios.get(
        `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
        {
          timeout: 8_000,
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
          validateStatus: () => true,
        },
      );
      if (res.status === 404) return null;
      if (res.status >= 400 || !res.data || typeof res.data !== 'object') {
        return null;
      }
      return mapBrasilApiCnpj(res.data as Record<string, unknown>, cnpj);
    } catch {
      return null;
    }
  }

  private async fetchReceitaWs(
    cnpj: string,
  ): Promise<CnpjLookupResult | null> {
    try {
      const res = await axios.get(
        `https://www.receitaws.com.br/v1/cnpj/${cnpj}`,
        {
          timeout: 8_000,
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
          validateStatus: () => true,
        },
      );
      if (res.status === 429) return null;
      if (res.status >= 400 || !res.data || typeof res.data !== 'object') {
        return null;
      }
      return mapReceitaWsCnpj(res.data as Record<string, unknown>, cnpj);
    } catch (err) {
      const ax = err as AxiosError;
      if (ax.response?.status === 429) return null;
      return null;
    }
  }
}
