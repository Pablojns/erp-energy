import {
  findSimilarExternalItem,
  namesLookSimilar,
  normalizeItemName,
  planWrongWegItemReplaces,
} from './conta-azul.itens-externos-xml';
import type { NfeXmlItem } from './conta-azul.nfe-xml';

const copoXml: NfeXmlItem = {
  nItem: 1,
  sku: 'VIAGEM-01',
  description: 'Copo de Viagem',
  ncm: null,
  unit: 'UN',
  quantity: 50,
  unitPrice: 18.9,
  totalPrice: 945,
};

describe('planWrongWegItemReplaces', () => {
  it('corrige Copo Térmico Cuia → Copo de Viagem no pedido 4518727765', () => {
    const plan = planWrongWegItemReplaces({
      orderItems: [
        {
          id: 'item-1',
          lineNumber: 10,
          sku: '50000001',
          description: 'Copo Térmico Cuia',
          quantity: 50,
          productId: 'prod-weg-cuia',
          productName: 'Copo Térmico Cuia',
          unitPrice: 22,
        },
      ],
      xmlItems: [copoXml],
    });
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      itemId: 'item-1',
      fromDescription: 'Copo Térmico Cuia',
      toDescription: 'Copo de Viagem',
      productId: 'prod-weg-cuia',
      reuseExternalItemId: null,
      externalItemName: 'Copo de Viagem',
    });
  });

  it('reusa ExternalItem com o mesmo nome normalizado', () => {
    const plan = planWrongWegItemReplaces({
      orderItems: [
        {
          id: 'item-1',
          lineNumber: 10,
          sku: '50000001',
          description: 'Copo Térmico Cuia',
          quantity: 50,
          productId: 'prod-weg-cuia',
          productName: 'Copo Térmico Cuia',
          unitPrice: 22,
        },
      ],
      xmlItems: [copoXml],
      externalItems: [{ id: 'ext-1', name: 'COPO DE  VIAGEM' }],
    });
    expect(plan[0]?.reuseExternalItemId).toBe('ext-1');
  });

  it('não altera quando o nome do pedido já bate com o XML', () => {
    const plan = planWrongWegItemReplaces({
      orderItems: [
        {
          id: 'item-1',
          lineNumber: 10,
          sku: 'VIAGEM-01',
          description: 'Copo de Viagem',
          quantity: 50,
          productId: null,
          productName: null,
          unitPrice: 18.9,
        },
      ],
      xmlItems: [copoXml],
    });
    expect(plan).toHaveLength(0);
  });

  it('não altera linha sem productId (já é item livre)', () => {
    const plan = planWrongWegItemReplaces({
      orderItems: [
        {
          id: 'item-1',
          lineNumber: 10,
          sku: '',
          description: 'Copo Térmico Cuia',
          quantity: 50,
          productId: null,
          productName: null,
          unitPrice: 22,
        },
      ],
      xmlItems: [copoXml],
    });
    expect(plan).toHaveLength(0);
  });
});

describe('namesLookSimilar', () => {
  it('trata maiúsculas e espaços', () => {
    expect(namesLookSimilar('Copo de Viagem', 'COPO DE  VIAGEM')).toBe(true);
  });

  it('não considera Copo Térmico Cuia parecido com Copo de Viagem', () => {
    expect(namesLookSimilar('Copo Térmico Cuia', 'Copo de Viagem')).toBe(false);
  });

  it('normalizeItemName remove acento', () => {
    expect(normalizeItemName('Copo Térmico')).toBe('copo termico');
  });

  it('findSimilarExternalItem prefere igualdade normalizada', () => {
    const found = findSimilarExternalItem('Copo de Viagem', [
      { id: 'a', name: 'Copo Térmico Cuia' },
      { id: 'b', name: 'copo de viagem' },
    ]);
    expect(found?.id).toBe('b');
  });
});
