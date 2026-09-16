import {
  buildOrderSearchWhere,
  confirmedRemessaNumber,
  displayInvoiceNumber,
  displayPedidoNumero,
  invoiceNumberDigitList,
  invoiceNumberDigits,
  invoiceNumberMatchesRemessa,
  removeInvoiceNumberFromField,
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
    expect(invoiceNumberDigits('1 - 1881')).toBe('1881');
    expect(displayInvoiceNumber('1 - 1881')).toBe('1881');
    expect(displayInvoiceNumber('1 - 1016 | 1 - 832')).toBe('1016 | 832');
    expect(invoiceNumberDigitList('1 - 1211 | 1 - 912 | 1 - 865')).toEqual([
      '1211',
      '912',
      '865',
    ]);
    expect(invoiceNumberDigits('1 - 1764 | 1 - 1762 | 1 - 11760')).toBe('1764');
    expect(invoiceNumberDigitList('1 - 1764 | 1 - 1762 | 1 - 11760')).toEqual([
      '1764',
      '1762',
      '11760',
    ]);
    expect(displayInvoiceNumber('1 - 1764 | 1 - 1762 | 1 - 11760')).toBe(
      '1764 | 1762 | 11760',
    );
    expect(invoiceNumberDigits('1 - 1881')).toBe('1881');
    expect(displayInvoiceNumber('1 - 1016 | 1 - 832')).toBe('1016 | 832');
    expect(displayPedidoNumero({ code: 'PED-000036', externalOrderNumber: '4518727765' })).toBe(
      '4518727765',
    );
    expect(displayPedidoNumero({ code: 'PED-000036', externalOrderNumber: null })).toBe('');
  });
});

describe('removeInvoiceNumberFromField', () => {
  it('remove 1889 de um campo com uma ou várias NFs', () => {
    expect(removeInvoiceNumberFromField('1889', '1889')).toBeNull();
    expect(removeInvoiceNumberFromField('1 - 1889', '1889')).toBeNull();
    expect(removeInvoiceNumberFromField('1 - 1889 | 1 - 1890', '1889')).toBe(
      '1 - 1890',
    );
  });
});

describe('buildOrderSearchWhere', () => {
  it('também procura o nome atual do Customer vinculado', () => {
    const where = buildOrderSearchWhere('Kaik Camargo');
    expect(JSON.stringify(where)).toContain('"customer"');
    expect(JSON.stringify(where)).toContain('Kaik Camargo');
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
