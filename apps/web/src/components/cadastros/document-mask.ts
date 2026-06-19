export function digitsOnly(value: string) {
  return value.replace(/\D/g, '');
}

/** Formata CPF (11) ou CNPJ (14) conforme a quantidade de dígitos. */
export function formatCpfCnpj(value: string): string {
  const digits = digitsOnly(value).slice(0, 14);

  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }

  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

export function isCpfFormatted(value: string) {
  return digitsOnly(value).length <= 11;
}
