import { mapContaAzulVenda } from './conta-azul.vendas';
import {
  planNfVinculoAudit,
  planOldCompletedCleanup,
} from './conta-azul.nf-vinculo-audit';

describe('planNfVinculoAudit', () => {
  const base = {
    status: 'PARCIAL',
    notaRemessa: null as string | null,
    history: [] as Array<{ invoiceNumber: string }>,
  };

  it('detecta parcela WEG vinculada no pedido de outra família', () => {
    const plan = planNfVinculoAudit({
      orders: [
        {
          id: 'base',
          code: 'PED-1',
          externalOrderNumber: '4517818598',
          invoiceNumber: null,
          contaAzulVendaId: 'vnd-p1',
          ...base,
        },
        {
          id: 'errado',
          code: 'PED-2',
          externalOrderNumber: '4519085342',
          invoiceNumber: '9999',
          contaAzulVendaId: 'vnd-p2',
          ...base,
          history: [{ invoiceNumber: '9999' }],
        },
      ],
      vendas: [
        mapContaAzulVenda({
          id: 'vnd-p1',
          numero: '4517818598',
          total: 1800,
        })!,
        mapContaAzulVenda({
          id: 'vnd-p2',
          numero: '45178185981',
          total: 1600,
        })!,
      ],
    });
    expect(plan.ordersAffected).toBeGreaterThanOrEqual(1);
    expect(
      plan.mismatches.some(
        (row) =>
          row.orderId === 'errado' &&
          row.expectedOrderId === 'base' &&
          (row.kind === 'parcela_ca_em_pedido_errado' ||
            row.kind === 'venda_outra_familia'),
      ),
    ).toBe(true);
  });

  it('detecta NF da Conta Azul gravada em pedido de outra família', () => {
    const plan = planNfVinculoAudit({
      orders: [
        {
          id: 'base',
          code: 'PED-1',
          externalOrderNumber: '4517818598',
          invoiceNumber: '1001',
          contaAzulVendaId: 'vnd-p1',
          ...base,
          history: [{ invoiceNumber: '1001' }],
        },
        {
          id: 'errado',
          code: 'PED-2',
          externalOrderNumber: '4519085342',
          invoiceNumber: '1002',
          contaAzulVendaId: null,
          ...base,
          history: [{ invoiceNumber: '1002' }],
        },
      ],
      vendas: [
        mapContaAzulVenda({
          id: 'vnd-p1',
          numero: '4517818598',
          total: 1800,
        })!,
        mapContaAzulVenda({
          id: 'vnd-p2',
          numero: '45178185981',
          total: 1600,
        })!,
      ],
      notas: [{ numero: '1002', idVenda: 'vnd-p2' }],
    });
    expect(
      plan.mismatches.some(
        (row) => row.kind === 'nf_outra_familia' && row.orderId === 'errado',
      ),
    ).toBe(true);
  });

  it('detecta a mesma NF em duas famílias WEG mesmo concatenada com série', () => {
    const plan = planNfVinculoAudit({
      orders: [
        {
          id: 'a',
          code: 'PED-1',
          externalOrderNumber: '4517818598',
          invoiceNumber: '1 - 1211 | 1 - 912 | 1 - 865',
          contaAzulVendaId: null,
          ...base,
          history: [{ invoiceNumber: '1 - 1211 | 1 - 912 | 1 - 865' }],
        },
        {
          id: 'b',
          code: 'PED-2',
          externalOrderNumber: '4519085342',
          invoiceNumber: '1211',
          contaAzulVendaId: null,
          ...base,
          history: [{ invoiceNumber: '1211' }],
        },
      ],
      vendas: [],
    });
    expect(
      plan.mismatches.some(
        (row) => row.kind === 'nf_duplicada_familias' && row.nfDigits === '1211',
      ),
    ).toBe(true);
  });
});

describe('planOldCompletedCleanup', () => {
  it('lista pedido com NF e falta de separação', () => {
    const rows = planOldCompletedCleanup([
      {
        id: 'o1',
        code: 'PED-1',
        externalOrderNumber: '4517818598',
        invoiceNumber: '1001',
        contaAzulVendaId: null,
        status: 'PARCIAL',
        history: [{ invoiceNumber: '1001' }],
        items: [
          { quantity: 10, pickedQty: 3, missingQty: 7, invoicedQty: 0 },
        ],
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe('falta_separacao');
    expect(rows[0].faltaQty).toBe(7);
  });
});
