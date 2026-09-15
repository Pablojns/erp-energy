import {
  formatCep,
  type DeliveryAddressForm,
} from '@/src/components/cadastros/delivery-address';
import { digitsOnly } from '@/src/components/cadastros/document-mask';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

export type CnpjCompanyLookup = {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  source: 'brasilapi' | 'receitaws';
};

export async function fetchCompanyByCnpj(
  cnpj: string,
  signal?: AbortSignal,
): Promise<CnpjCompanyLookup> {
  const digits = digitsOnly(cnpj);
  if (digits.length !== 14) {
    throw new Error('Informe um CNPJ com 14 dígitos.');
  }
  return erpFetchJson<CnpjCompanyLookup>(`cadastros/cnpj/${digits}`, { signal });
}

export function cnpjLookupToAddressForm(
  result: CnpjCompanyLookup,
  current?: DeliveryAddressForm,
): DeliveryAddressForm {
  const cepDigits = digitsOnly(result.cep).slice(0, 8);
  return {
    cep: cepDigits.length === 8 ? formatCep(cepDigits) : current?.cep ?? '',
    logradouro: result.logradouro || current?.logradouro || '',
    bairro: result.bairro || current?.bairro || '',
    cidade: result.cidade || current?.cidade || '',
    uf: result.uf || current?.uf || '',
    numero: result.numero || current?.numero || '',
    complemento: result.complemento || current?.complemento || '',
  };
}
