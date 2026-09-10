import {
  extractDocumentoNumero,
  groupTitulosByDay,
  isCaOverdue,
  mapContaAzulPagar,
  mapContaAzulReceber,
  tituloFromDbRow,
} from './conta-azul.titulos';

describe('conta-azul.titulos', () => {
  it('mapeia conta a receber com status_traduzido e nao_pago', () => {
    const t = mapContaAzulReceber({
      id: 'rec-1',
      descricao: 'Venda 1 NF 2040',
      status: 'PENDING',
      status_traduzido: 'EM_ABERTO',
      total: 50,
      pago: 0,
      nao_pago: 50,
      data_vencimento: '2026-09-15',
      cliente: { nome: 'Cliente 01', documento: '12345678901' },
    });
    expect(t).toMatchObject({
      contaAzulId: 'rec-1',
      tipo: 'RECEBER',
      contraParte: 'Cliente 01',
      valorAberto: 50,
      pago: false,
    });
  });

  it('marca recebido quando nao_pago zera', () => {
    const t = mapContaAzulReceber({
      id: 'rec-2',
      descricao: 'Venda paga',
      status_traduzido: 'RECEBIDO',
      total: 100,
      pago: 100,
      nao_pago: 0,
      data_vencimento: '2026-09-01',
    });
    expect(t?.pago).toBe(true);
    expect(t?.valorAberto).toBe(0);
  });

  it('mapeia conta a pagar e detecta atraso', () => {
    const t = mapContaAzulPagar({
      id: 'pag-1',
      descricao: 'Aluguel',
      status_traduzido: 'EM_ABERTO',
      total: 200,
      nao_pago: 200,
      data_vencimento: '2026-01-10',
      fornecedor: { nome: 'Imobiliária' },
    });
    expect(t?.tipo).toBe('PAGAR');
    expect(t?.contraParte).toBe('Imobiliária');
    expect(isCaOverdue(t!, new Date('2026-09-10T12:00:00Z'))).toBe(true);
  });

  it('agrupa vencimentos por dia para o calendário', () => {
    const rec = mapContaAzulReceber({
      id: 'r1',
      descricao: 'NF 1',
      status_traduzido: 'EM_ABERTO',
      total: 80,
      nao_pago: 80,
      data_vencimento: '2026-09-10',
    })!;
    const pag = mapContaAzulPagar({
      id: 'p1',
      descricao: 'Boleto',
      status_traduzido: 'EM_ABERTO',
      total: 30,
      nao_pago: 30,
      data_vencimento: '2026-09-10',
    })!;
    const days = groupTitulosByDay([rec, pag], new Date('2026-09-11T12:00:00Z'));
    expect(days['2026-09-10']?.aReceber).toBe(80);
    expect(days['2026-09-10']?.aPagar).toBe(30);
    expect(days['2026-09-10']?.overdue).toBe(true);
    expect(days['2026-09-10']?.items).toHaveLength(2);
  });

  it('extrai NF-e da descrição e fatura.numero do payload', () => {
    expect(
      extractDocumentoNumero({
        descricao: 'Venda 4519145810 / NF-e:2170',
      }),
    ).toBe('2170');
    expect(
      extractDocumentoNumero({
        descricao: '2/2 - Venda 4518317833117 / NF-e:2139',
      }),
    ).toBe('2139');
    expect(
      extractDocumentoNumero({
        descricao: 'Compra de produto 82 (NFe 490190-1)',
      }),
    ).toBe('490190-1');
    expect(
      extractDocumentoNumero({
        id: 'x',
        fatura: { numero: 2170, tipo_fatura: 'NFE' },
        descricao: 'Venda 4519145810',
      }),
    ).toBe('2170');
    expect(extractDocumentoNumero({ descricao: 'FACEBOOK ADS' })).toBeNull();
  });

  it('preenche numero no calendário a partir da descrição já sincronizada', () => {
    const rec = tituloFromDbRow({
      contaAzulId: 'r-2170',
      tipo: 'RECEBER',
      origem: 'receber',
      numero: null,
      descricao: 'Venda 4519145810 / NF-e:2170',
      contraParte: 'WEG-CESTARI',
      documento: null,
      valor: 753.9,
      valorPago: 0,
      valorAberto: 753.9,
      vencimento: new Date('2026-09-15T12:00:00Z'),
      competencia: null,
      status: 'EM_ABERTO',
      pago: false,
    });
    const pag = tituloFromDbRow({
      contaAzulId: 'p-nfe',
      tipo: 'PAGAR',
      origem: 'pagar',
      numero: null,
      descricao: 'Compra de produto 82 (NFe 490190-1)',
      contraParte: 'SPOT',
      documento: null,
      valor: 1200,
      valorPago: 0,
      valorAberto: 1200,
      vencimento: new Date('2026-09-15T12:00:00Z'),
      competencia: null,
      status: 'EM_ABERTO',
      pago: false,
    });
    const days = groupTitulosByDay([rec, pag], new Date('2026-09-10T12:00:00Z'));
    expect(days['2026-09-15']?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tipo: 'RECEBER',
          numero: '2170',
          contraParte: 'WEG-CESTARI',
          valor: 753.9,
        }),
        expect.objectContaining({
          tipo: 'PAGAR',
          numero: '490190-1',
          contraParte: 'SPOT',
          valor: 1200,
        }),
      ]),
    );
  });
});
