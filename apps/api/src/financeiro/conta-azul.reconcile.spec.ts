import { mapContaAzulNf, reconcileContaAzulNfs } from './conta-azul.reconcile';

describe('conta-azul.reconcile', () => {
  it('mapeia NF da API sem assumir valor quando o campo não veio', () => {
    const mapped = mapContaAzulNf({
      numero_nota: 2040,
      status: 'EMITIDA',
      data_emissao: '2026-09-09T12:00:00Z',
      nome_destinatario: 'ACME',
      chave_acesso: '4225...',
    });
    expect(mapped.numeroDigits).toBe('2040');
    expect(mapped.valor).toBeNull();
    expect(mapped.status).toBe('EMITIDA');
  });

  it('usa valor_total_nfse quando a API de serviço informa o valor', () => {
    expect(mapContaAzulNf({ numero_nota: 1, valor_total_nfse: 1500.5 }).valor).toBe(
      1500.5,
    );
    expect(mapContaAzulNf({ numero_nfse: 123, valor_total_nfse: 10 }).numeroDigits).toBe(
      '123',
    );
  });

  it('lê id_venda direto ou aninhado em venda.id', () => {
    expect(mapContaAzulNf({ numero_nota: '1959', id_venda: 'vnd-1' }).idVenda).toBe(
      'vnd-1',
    );
    expect(
      mapContaAzulNf({ numero_nota: '1959', venda: { id: 'vnd-2' } }).idVenda,
    ).toBe('vnd-2');
  });

  it('aponta NF só na CA, só no ERP, e gaps da trava de finalização', () => {
    const result = reconcileContaAzulNfs({
      ca: [
        mapContaAzulNf({ numero_nota: '100' }),
        mapContaAzulNf({ numero_nota: '200' }),
      ],
      erp: [
        {
          orderId: 'o1',
          pedido: '4518',
          invoiceNumber: '200',
          invoiceDigits: '200',
          status: 'FINALIZADO',
          invoiceValue: 10,
        },
        {
          orderId: 'o2',
          pedido: '4519',
          invoiceNumber: '300',
          invoiceDigits: '300',
          status: 'FINALIZADO',
          invoiceValue: 20,
        },
      ],
      finalizeGaps: [
        {
          pedido: '4518',
          invoiceNumber: '200',
          message: 'Não é possível finalizar: NF não vinculada',
        },
      ],
    });
    expect(result.matched).toBe(1);
    expect(result.divergencias.map((d) => d.tipo).sort()).toEqual([
      'ca_sem_erp',
      'erp_sem_ca',
      'finalize_gap',
    ]);
  });
});
