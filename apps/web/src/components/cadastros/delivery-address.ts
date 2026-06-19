import { digitsOnly } from '@/src/components/cadastros/document-mask';

export type DeliveryAddressForm = {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
  numero: string;
  complemento: string;
};

export type StoredDeliveryAddress = DeliveryAddressForm & { v: 1 };

export function emptyDeliveryAddressForm(): DeliveryAddressForm {
  return {
    cep: '',
    logradouro: '',
    bairro: '',
    cidade: '',
    uf: '',
    numero: '',
    complemento: '',
  };
}

export function formatCep(value: string) {
  const digits = digitsOnly(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function serializeDeliveryAddress(form: DeliveryAddressForm): string {
  return JSON.stringify({
    v: 1 as const,
    cep: formatCep(form.cep),
    logradouro: form.logradouro.trim(),
    bairro: form.bairro.trim(),
    cidade: form.cidade.trim(),
    uf: form.uf.trim().toUpperCase(),
    numero: form.numero.trim(),
    complemento: form.complemento.trim(),
  } satisfies StoredDeliveryAddress);
}

export function parseDeliveryAddress(
  raw: string | null | undefined,
): DeliveryAddressForm | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredDeliveryAddress>;
    if (parsed.v !== 1) return null;
    return {
      cep: parsed.cep ?? '',
      logradouro: parsed.logradouro ?? '',
      bairro: parsed.bairro ?? '',
      cidade: parsed.cidade ?? '',
      uf: parsed.uf ?? '',
      numero: parsed.numero ?? '',
      complemento: parsed.complemento ?? '',
    };
  } catch {
    return null;
  }
}

export function formatDeliveryAddressDisplay(raw: string | null | undefined) {
  if (!raw?.trim()) return '—';
  const parsed = parseDeliveryAddress(raw);
  if (!parsed) return raw;
  const parts = [
    `${parsed.logradouro}, ${parsed.numero}`,
    parsed.complemento || null,
    parsed.bairro,
    `${parsed.cidade}/${parsed.uf}`,
    `CEP ${formatCep(parsed.cep)}`,
  ].filter(Boolean);
  return parts.join(' - ');
}

export type ViaCepResponse = {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

export async function fetchAddressByCep(cep: string): Promise<DeliveryAddressForm> {
  const digits = digitsOnly(cep);
  if (digits.length !== 8) {
    throw new Error('Informe um CEP válido com 8 dígitos.');
  }

  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  if (!res.ok) {
    throw new Error('Não foi possível consultar o CEP.');
  }

  const data = (await res.json()) as ViaCepResponse;
  if (data.erro) {
    throw new Error('CEP não encontrado.');
  }

  return {
    cep: formatCep(digits),
    logradouro: data.logradouro?.trim() ?? '',
    bairro: data.bairro?.trim() ?? '',
    cidade: data.localidade?.trim() ?? '',
    uf: data.uf?.trim().toUpperCase() ?? '',
    numero: '',
    complemento: '',
  };
}
