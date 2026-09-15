import {
  findSimilarExternalItem,
  namesAreEquivalentProduct,
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

  it('não sinaliza divergência quando o SKU do XML é o mesmo do pedido', () => {
    const plan = planWrongWegItemReplaces({
      orderItems: [
        {
          id: 'item-1',
          lineNumber: 10,
          sku: '50019097',
          description: 'Caneta Crown Metal PT',
          quantity: 100,
          productId: 'prod-weg',
          productName: 'Caneta Crown Metal PT',
          unitPrice: 2,
        },
      ],
      xmlItems: [
        {
          nItem: 1,
          sku: '50019097',
          description: 'Caneta Crown Metal',
          ncm: null,
          unit: 'UN',
          quantity: 100,
          unitPrice: 2,
          totalPrice: 200,
        },
      ],
    });
    expect(plan).toHaveLength(0);
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

  it('pareia COPO VIAGEM com a linha 30 via nItemPed, não com Caneta Plástica', () => {
    const plan = planWrongWegItemReplaces({
      orderItems: [
        {
          id: 'item-caneta',
          lineNumber: 10,
          sku: '50019097',
          description: 'CANETA PLASTICA',
          quantity: 300,
          productId: 'prod-caneta',
          productName: 'Caneta Plástica',
          unitPrice: 1,
        },
        {
          id: 'item-copo',
          lineNumber: 30,
          sku: '50000001',
          description: 'Copo Térmico Aluminio - De Inox (Cuia)',
          quantity: 50,
          productId: 'prod-cuia',
          productName: 'Copo Térmico Aluminio - De Inox (Cuia)',
          unitPrice: 22,
        },
      ],
      xmlItems: [
        {
          nItem: 1,
          sku: 'VIAGEM-01',
          description: 'COPO VIAGEM',
          ncm: null,
          unit: 'UN',
          quantity: 50,
          unitPrice: 18.9,
          totalPrice: 945,
          xPed: '4518727765',
          nItemPed: 30,
        },
      ],
    });
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      itemId: 'item-copo',
      lineNumber: 30,
      fromDescription: 'Copo Térmico Aluminio - De Inox (Cuia)',
      toDescription: 'COPO VIAGEM',
    });
  });

  it('não sinaliza Caneta Plástica vs Caneta Plástico como divergência', () => {
    const plan = planWrongWegItemReplaces({
      orderItems: [
        {
          id: 'item-caneta',
          lineNumber: 10,
          sku: '50019097',
          description: 'CANETA PLASTICA',
          quantity: 300,
          productId: 'prod-caneta',
          productName: 'Caneta Plástica',
          unitPrice: 1,
        },
      ],
      xmlItems: [
        {
          nItem: 1,
          sku: '50019097',
          description: 'CANETA PLASTICO',
          ncm: null,
          unit: 'UN',
          quantity: 300,
          unitPrice: 1,
          totalPrice: 300,
          nItemPed: 10,
        },
      ],
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

describe('namesAreEquivalentProduct', () => {
  it('trata variação de gênero/plural', () => {
    expect(namesAreEquivalentProduct('CANETA PLASTICA', 'CANETA PLASTICO')).toBe(
      true,
    );
  });

  it('ignora sufixo curto PT', () => {
    expect(
      namesAreEquivalentProduct(
        'CANETA ESFERO PONTA TOUCH METAL PT',
        'CANETA ESFERO PONTA TOUCH METAL',
      ),
    ).toBe(true);
  });

  it('não mistura Copo Cuia com Copo Viagem', () => {
    expect(
      namesAreEquivalentProduct(
        'Copo Térmico Aluminio - De Inox (Cuia)',
        'COPO VIAGEM',
      ),
    ).toBe(false);
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
