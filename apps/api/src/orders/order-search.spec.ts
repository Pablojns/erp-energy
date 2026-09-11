import {
  confirmedRemessaNumber,
  invoiceNumberDigits,
  invoiceNumberMatchesRemessa,
  sameInvoiceNumber,
} from './order-search';

describe('confirmedRemessaNumber', () => {
  it('só devolve a remessa quando está confirmada', () => {
    expect(
      confirmedRemessaNumber({
        notaRemessa: '878',
        notaRemessaConfirmada: true,
      }),
    ).toBe('878');
    expect(
      confirmedRemessaNumber({
        notaRemessa: '878',
        notaRemessaConfirmada: false,
      }),
    ).toBe('');
  });

  it('não trata rastreio Correios como remessa', () => {
    expect(
      confirmedRemessaNumber({
        notaRemessa: 'AP373095360BR',
        notaRemessaConfirmada: true,
      }),
    ).toBe('');
  });
});

describe('sameInvoiceNumber', () => {
  it('compara 2156 e 878 como distintos', () => {
    expect(sameInvoiceNumber('2156', '878')).toBe(false);
    expect(sameInvoiceNumber('878', '878')).toBe(true);
    expect(invoiceNumberDigits('2156')).toBe('2156');
  });
});

describe('invoiceNumberMatchesRemessa', () => {
  it('detecta Nota de Venda ocupada pelo número da remessa', () => {
    expect(invoiceNumberMatchesRemessa('870', '870')).toBe(true);
    expect(invoiceNumberMatchesRemessa('2156', '870')).toBe(false);
    expect(invoiceNumberMatchesRemessa('', '870')).toBe(false);
    expect(invoiceNumberMatchesRemessa('870', '')).toBe(false);
  });
});
