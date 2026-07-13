'use client';

import { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { formatCpfCnpj } from '@/src/components/cadastros/document-mask';
import {
  emptyDeliveryAddressForm,
  fetchAddressByCep,
  formatCep,
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
}) {
  const { values, onChange, disabled, legacyAddress, error, onClearError } = props;
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);

  const addressFieldsDisabled = disabled || !values.addressLoaded;

  const patch = (partial: Partial<CustomerFormValues>) => {
    onChange({ ...values, ...partial });
    onClearError?.();
  };

  const patchAddress = (partial: Partial<DeliveryAddressForm>) => {
    patch({
      address: { ...values.address, ...partial },
    });
  };

  const handleCepSearch = async () => {
    setCepError(null);
    onClearError?.();
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
      patch({ addressLoaded: false });
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
          placeholder="Nome do cliente"
          disabled={disabled}
          autoFocus
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-gray-600">CNPJ/CPF</span>
        <input
          type="text"
          inputMode="numeric"
          value={values.document}
          onChange={(e) => patch({ document: formatCpfCnpj(e.target.value) })}
          className={fieldInputClass(disabled)}
          placeholder="000.000.000-00 ou 00.000.000/0000-00"
          disabled={disabled}
          maxLength={18}
        />
      </label>

      <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm font-medium text-gray-700">Endereço de entrega</p>

        {legacyAddress && !values.addressLoaded ? (
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
                if (values.addressLoaded) {
                  patch({ addressLoaded: false });
                }
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
            readOnly
            disabled={addressFieldsDisabled}
            className={fieldInputClass(addressFieldsDisabled)}
            placeholder="Busque o CEP"
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-600">Bairro</span>
            <input
              type="text"
              value={values.address.bairro}
              readOnly
              disabled={addressFieldsDisabled}
              className={fieldInputClass(addressFieldsDisabled)}
              placeholder="Busque o CEP"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-600">Cidade</span>
            <input
              type="text"
              value={values.address.cidade}
              readOnly
              disabled={addressFieldsDisabled}
              className={fieldInputClass(addressFieldsDisabled)}
              placeholder="Busque o CEP"
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-gray-600">Estado (UF)</span>
          <input
            type="text"
            value={values.address.uf}
            readOnly
            disabled={addressFieldsDisabled}
            className={fieldInputClass(addressFieldsDisabled)}
            placeholder="Busque o CEP"
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

function digitsOnly(value: string) {
  return value.replace(/\D/g, '');
}

export function validateCustomerForm(values: CustomerFormValues): string | null {
  if (!values.name.trim()) return 'Informe o nome.';
  if (values.addressLoaded && !values.address.numero.trim()) {
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

  if (values.addressLoaded) {
    payload.deliveryAddress = serializeDeliveryAddress({
      ...values.address,
      numero: values.address.numero.trim(),
    });
  }

  return payload;
}
