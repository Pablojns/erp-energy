'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import {
  cnpjLookupToAddressForm,
  fetchCompanyByCnpj,
} from '@/src/components/cadastros/cnpj-lookup';
import { digitsOnly, formatCpfCnpj } from '@/src/components/cadastros/document-mask';
import {
  emptyDeliveryAddressForm,
  fetchAddressByCep,
  formatCep,
  hasStructuredAddress,
  serializeDeliveryAddress,
  type DeliveryAddressForm,
} from '@/src/components/cadastros/delivery-address';

function fieldInputClass(disabled?: boolean) {
  return `w-full rounded-lg border border-gray-200 bg-[var(--input-bg)] px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 ${
    disabled ? 'cursor-not-allowed opacity-60' : ''
  }`;
}

export type CustomerFormValues = {
  name: string;
  document: string;
  address: DeliveryAddressForm;
  addressLoaded: boolean;
};

export function emptyCustomerFormValues(): CustomerFormValues {
  return {
    name: '',
    document: '',
    address: emptyDeliveryAddressForm(),
    addressLoaded: false,
  };
}

export function CustomerFormFields(props: {
  values: CustomerFormValues;
  onChange: (values: CustomerFormValues) => void;
  disabled?: boolean;
  legacyAddress?: string | null;
  error?: string | null;
  onClearError?: () => void;
  namePlaceholder?: string;
  documentLabel?: string;
}) {
  const {
    values,
    onChange,
    disabled,
    legacyAddress,
    error,
    onClearError,
    namePlaceholder = 'Nome do cliente',
    documentLabel = 'CNPJ/CPF',
  } = props;
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjHint, setCnpjHint] = useState<string | null>(null);
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onClearErrorRef = useRef(onClearError);
  onClearErrorRef.current = onClearError;
  const initialCnpjRef = useRef(digitsOnly(values.document));
  const lastLookedUpRef = useRef<string | null>(null);

  const patch = (partial: Partial<CustomerFormValues>) => {
    onChangeRef.current({ ...valuesRef.current, ...partial });
    onClearErrorRef.current?.();
  };

  const patchAddress = (partial: Partial<DeliveryAddressForm>) => {
    patch({
      address: { ...valuesRef.current.address, ...partial },
    });
  };

  useEffect(() => {
    const digits = digitsOnly(values.document);
    if (digits.length !== 14) {
      setCnpjLoading(false);
      if (digits.length > 0 && digits.length < 14) setCnpjHint(null);
      lastLookedUpRef.current = null;
      return;
    }
    if (digits === initialCnpjRef.current) return;
    if (digits === lastLookedUpRef.current) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCnpjLoading(true);
      setCnpjHint(null);
      void fetchCompanyByCnpj(digits, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          lastLookedUpRef.current = digits;
          const current = valuesRef.current;
          onChangeRef.current({
            ...current,
            name: result.razaoSocial || current.name,
            document: formatCpfCnpj(digits),
            address: cnpjLookupToAddressForm(result, current.address),
            addressLoaded: true,
          });
          onClearErrorRef.current?.();
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          if (err instanceof DOMException && err.name === 'AbortError') return;
          if (err instanceof Error && err.name === 'AbortError') return;
          setCnpjHint(
            'Não foi possível consultar o CNPJ. Preencha os dados manualmente.',
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setCnpjLoading(false);
        });
    }, 400);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [values.document]);

  const handleCepSearch = async () => {
    setCepError(null);
    onClearErrorRef.current?.();
    setCepLoading(true);
    try {
      const found = await fetchAddressByCep(values.address.cep);
      patch({
        address: {
          ...found,
          numero: values.address.numero,
          complemento: values.address.complemento,
        },
        addressLoaded: true,
      });
    } catch (err) {
      setCepError(err instanceof Error ? err.message : 'Falha ao buscar CEP.');
    } finally {
      setCepLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-gray-600">
          Nome <span className="text-rose-400">*</span>
        </span>
        <input
          type="text"
          value={values.name}
          onChange={(e) => patch({ name: e.target.value })}
          className={fieldInputClass(disabled)}
          placeholder={namePlaceholder}
          disabled={disabled}
          autoFocus
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1.5 flex items-center gap-2 font-medium text-gray-600">
          {documentLabel}
          {cnpjLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
          ) : null}
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={values.document}
          onChange={(e) => patch({ document: formatCpfCnpj(e.target.value) })}
          className={fieldInputClass(disabled)}
          placeholder={
            documentLabel === 'CNPJ/CPF'
              ? '000.000.000-00 ou 00.000.000/0000-00'
              : '00.000.000/0000-00'
          }
          disabled={disabled}
          maxLength={18}
        />
        {cnpjHint ? (
          <p className="mt-1 text-xs text-gray-500">{cnpjHint}</p>
        ) : null}
      </label>

      <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm font-medium text-gray-700">Endereço de entrega</p>

        {legacyAddress && !values.addressLoaded && !hasStructuredAddress(values.address) ? (
          <p className="text-xs text-gray-500">
            Endereço atual: {legacyAddress}. Busque o CEP para atualizar o
            formulário estruturado.
          </p>
        ) : null}

        <div className="flex flex-wrap items-end gap-2">
          <label className="block min-w-[140px] flex-1 text-sm">
            <span className="mb-1.5 block font-medium text-gray-600">CEP</span>
            <input
              type="text"
              inputMode="numeric"
              value={values.address.cep}
              onChange={(e) => {
                patchAddress({ cep: formatCep(e.target.value) });
                setCepError(null);
              }}
              className={fieldInputClass(disabled)}
              placeholder="00000-000"
              disabled={disabled}
              maxLength={9}
            />
          </label>
          <button
            type="button"
            onClick={() => void handleCepSearch()}
            disabled={disabled || cepLoading || digitsOnly(values.address.cep).length !== 8}
            className="erp-focus-ring erp-btn erp-btn-primary erp-btn--md inline-flex h-[38px] items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cepLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Buscar
          </button>
        </div>
        {cepError ? <p className="text-xs text-rose-400">{cepError}</p> : null}

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-gray-600">Logradouro</span>
          <input
            type="text"
            value={values.address.logradouro}
            onChange={(e) => patchAddress({ logradouro: e.target.value })}
            disabled={disabled}
            className={fieldInputClass(disabled)}
            placeholder="Rua, avenida..."
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-600">Bairro</span>
            <input
              type="text"
              value={values.address.bairro}
              onChange={(e) => patchAddress({ bairro: e.target.value })}
              disabled={disabled}
              className={fieldInputClass(disabled)}
              placeholder="Bairro"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-600">Cidade</span>
            <input
              type="text"
              value={values.address.cidade}
              onChange={(e) => patchAddress({ cidade: e.target.value })}
              disabled={disabled}
              className={fieldInputClass(disabled)}
              placeholder="Cidade"
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-gray-600">Estado (UF)</span>
          <input
            type="text"
            value={values.address.uf}
            onChange={(e) =>
              patchAddress({ uf: e.target.value.toUpperCase().slice(0, 2) })
            }
            disabled={disabled}
            className={fieldInputClass(disabled)}
            placeholder="UF"
            maxLength={2}
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-600">
              Número <span className="text-rose-400">*</span>
            </span>
            <input
              type="text"
              value={values.address.numero}
              onChange={(e) => patchAddress({ numero: e.target.value })}
              className={fieldInputClass(disabled)}
              placeholder="Nº"
              disabled={disabled}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-600">Complemento</span>
            <input
              type="text"
              value={values.address.complemento}
              onChange={(e) => patchAddress({ complemento: e.target.value })}
              className={fieldInputClass(disabled)}
              placeholder="Opcional"
              disabled={disabled}
            />
          </label>
        </div>
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
    </div>
  );
}

export function validateCustomerForm(values: CustomerFormValues): string | null {
  if (!values.name.trim()) return 'Informe o nome.';
  if (hasStructuredAddress(values.address) && !values.address.numero.trim()) {
    return 'Informe o número do endereço.';
  }
  return null;
}

export function customerFormToApiPayload(values: CustomerFormValues) {
  const payload: {
    name: string;
    cnpj?: string;
    deliveryAddress?: string;
  } = {
    name: values.name.trim(),
  };

  if (values.document.trim()) {
    payload.cnpj = values.document.trim();
  }

  if (values.addressLoaded || hasStructuredAddress(values.address)) {
    payload.deliveryAddress = serializeDeliveryAddress({
      ...values.address,
      numero: values.address.numero.trim(),
    });
  }

  return payload;
}
