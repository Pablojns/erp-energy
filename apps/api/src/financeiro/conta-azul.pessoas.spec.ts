import { serializeStoredDeliveryAddress } from '../common/delivery-address';
import {
  buyerNameLooksLikeReceiver,
  diffPedidoCadastro,
  documentDigits,
  mapContaAzulPessoa,
  mapContaAzulPessoaParaPedido,
  normalizePersonName,
  orderNeedsPedidoCadastroFill,
  planCadastroSync,
  planErpCadastroApply,
  planPessoasDivergencias,
  planPreencherPedidosCadastro,
} from './conta-azul.pessoas';

const enderecoCa = {
  cep: '01310-100',
  logradouro: 'Avenida Paulista',
  numero: '1000',
  complemento: 'Cj 12',
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  estado: 'SP',
  pais: 'Brasil',
};

describe('conta-azul.pessoas', () => {
  it('mapeia pessoa da listagem com endereço aninhado', () => {
    const p = mapContaAzulPessoa({
      id: 'pes-1',
      nome: 'WEG Equipamentos Elétricos S/A',
      documento: '84.429.695/0001-11',
      tipo_pessoa: 'JURIDICA',
      perfis: [{ tipo_perfil: 'Cliente' }],
      endereco: enderecoCa,
    });
    expect(p).toMatchObject({
      contaAzulId: 'pes-1',
      documentoDigits: '84429695000111',
      nome: 'WEG Equipamentos Elétricos S/A',
      tipoPessoa: 'JURIDICA',
      perfis: ['CLIENTE'],
    });
    expect(p?.endereco).toMatchObject({
      cep: '01310100',
      logradouro: 'Avenida Paulista',
      numero: '1000',
      cidade: 'São Paulo',
      uf: 'SP',
    });
    expect(p?.enderecoJson).toContain('"v":1');
  });

  it('escolhe o endereço com CEP na lista de endereços do detalhe', () => {
    const p = mapContaAzulPessoa({
      id: 'pes-2',
      nome: 'Cliente Teste',
      documento: '12345678000199',
      enderecos: [
        {
          logradouro: 'Rua Sem Cep',
          numero: '1',
          cidade: 'Campinas',
          estado: 'SP',
        },
        {
          cep: '13015-000',
          logradouro: 'Rua Conceição',
          numero: '50',
          bairro: 'Centro',
          cidade: 'Campinas',
          estado: 'SP',
        },
      ],
    });
    expect(p?.endereco?.cep).toBe('13015000');
    expect(p?.endereco?.logradouro).toBe('Rua Conceição');
  });

  it('ignora pessoa sem documento válido', () => {
    expect(
      mapContaAzulPessoa({
        id: 'pes-3',
        nome: 'Sem doc',
        documento: '123',
      }),
    ).toBeNull();
  });

  it('normaliza nome ignorando acento e caixa', () => {
    expect(normalizePersonName('São  José')).toBe('SAO JOSE');
    expect(documentDigits('12.345.678/0001-90')).toBe('12345678000190');
  });

  it('marca pedido com nome divergente e endereço vazio', () => {
    const pessoa = mapContaAzulPessoa({
      id: 'pes-4',
      nome: 'Energy Brands Ltda',
      documento: '11222333000181',
      endereco: enderecoCa,
    })!;
    const diff = diffPedidoCadastro({
      orderId: 'ord-1',
      code: 'PED-000001',
      externalOrderNumber: 'F-99',
      customerId: 'cus-1',
      customerName: 'ENERGY BRANDS',
      customerDocument: '11.222.333/0001-81',
      deliveryCnpj: null,
      deliveryAddress: '',
      pessoa,
    });
    expect(diff?.name).toEqual({
      from: 'ENERGY BRANDS',
      to: 'Energy Brands Ltda',
    });
    expect(diff?.address?.from).toBe('');
    expect(diff?.address?.to).toContain('Avenida Paulista');
  });

  it('não gera diff quando nome e endereço já conferem', () => {
    const pessoa = mapContaAzulPessoa({
      id: 'pes-5',
      nome: 'Energy Brands Ltda',
      documento: '11222333000181',
      endereco: enderecoCa,
    })!;
    const diff = diffPedidoCadastro({
      orderId: 'ord-2',
      code: 'PED-000002',
      externalOrderNumber: null,
      customerId: null,
      customerName: 'ENERGY BRANDS LTDA',
      customerDocument: '11222333000181',
      deliveryCnpj: '11222333000181',
      deliveryAddress: pessoa.enderecoJson,
      pessoa,
    });
    expect(diff).toBeNull();
  });

  it('cruza pedidos e clientes pelo CNPJ', () => {
    const pessoa = mapContaAzulPessoa({
      id: 'pes-6',
      nome: 'Oficial SA',
      documento: '99888777000166',
      endereco: enderecoCa,
    })!;
    const plan = planCadastroSync({
      pessoas: [pessoa],
      orders: [
        {
          id: 'o1',
          code: 'PED-1',
          externalOrderNumber: '10',
          customerId: 'c1',
          customerName: 'Oficial',
          customerDocument: '99888777000166',
          deliveryCnpj: null,
          deliveryAddress: serializeStoredDeliveryAddress({
            cep: '01310100',
            logradouro: 'Outra Rua',
            numero: '1',
            complemento: '',
            bairro: 'Centro',
            cidade: 'São Paulo',
            uf: 'SP',
          }),
        },
      ],
      customers: [
        {
          id: 'c1',
          name: 'Oficial SA',
          document: '99.888.777/0001-66',
          deliveryAddress: null,
        },
      ],
    });
    expect(plan.pedidos).toHaveLength(1);
    expect(plan.pedidos[0].address?.from).toContain('Outra Rua');
    expect(plan.clientes).toHaveLength(1);
    expect(plan.clientes[0].address?.from).toBe('');
  });

  it('relata cadastro só na Conta Azul e nome divergente no Customer', () => {
    const pessoa = mapContaAzulPessoa({
      id: 'pes-7',
      nome: 'Oficial SA',
      documento: '11222333000181',
      perfis: ['Cliente'],
    })!;
    const { divergencias } = planPessoasDivergencias({
      pessoas: [pessoa],
      parties: [
        {
          kind: 'CUSTOMER',
          id: 'c1',
          name: 'Oficial',
          document: '11.222.333/0001-81',
        },
        {
          kind: 'SUPPLIER',
          id: 's1',
          name: 'Fornecedor ERP',
          document: '99888777000166',
        },
      ],
    });
    expect(divergencias.some((d) => d.tipo === 'nome' && d.kind === 'CUSTOMER')).toBe(
      true,
    );
    expect(
      divergencias.some(
        (d) => d.tipo === 'so_erp' && d.kind === 'SUPPLIER' && d.erpId === 's1',
      ),
    ).toBe(true);
  });

  it('detecta comprador WEG copiado do recebedor e endereço vazio', () => {
    expect(
      buyerNameLooksLikeReceiver({
        customerName: 'VIVIAN/4905',
        receiverName: 'VIVIAN/4905',
      }),
    ).toBe(true);
    expect(
      buyerNameLooksLikeReceiver({
        customerName: 'VIVIAN/4905',
        receiverName: 'VIVIAN',
      }),
    ).toBe(true);
    expect(
      buyerNameLooksLikeReceiver({
        customerName: 'WEG EQUIPAMENTOS ELETRICOS S/A',
        receiverName: 'VIVIAN/4905',
      }),
    ).toBe(false);
    expect(
      orderNeedsPedidoCadastroFill({
        deliveryCnpj: '07.175.725/0012-12',
        deliveryAddress: null,
        customerName: 'VIVIAN/4905',
        receiverName: 'VIVIAN/4905',
      }),
    ).toBe(true);
    expect(
      orderNeedsPedidoCadastroFill({
        deliveryCnpj: '07.175.725/0012-12',
        deliveryAddress: serializeStoredDeliveryAddress({
          cep: '89252230',
          logradouro: 'Rua Teste',
          numero: '1',
          complemento: '',
          bairro: 'Centro',
          cidade: 'Jaraguá do Sul',
          uf: 'SC',
        }),
        customerName: 'WEG EQUIPAMENTOS ELETRICOS S/A',
        receiverName: 'VIVIAN/4905',
      }),
    ).toBe(false);
  });

  it('planeja preenchimento de pedido com nome oficial e endereço da CA', () => {
    const pessoa = mapContaAzulPessoaParaPedido({
      id: 'pes-weg',
      nome: 'DIVISAO MOTORES - FABRICA - PARQUE FABRIL I -',
      nome_empresa: 'WEG EQUIPAMENTOS ELETRICOS S/A',
      documento: '07175725001212',
      enderecos: [
        {
          cep: '89252230',
          logradouro: 'VENANCIO DA SILVA PORTO',
          numero: '399',
          complemento: 'BLOCO C',
          bairro: 'NOVA BRASILIA',
          cidade: 'Jaraguá do Sul',
          estado: 'SC',
        },
      ],
    })!;
    expect(pessoa.nome).toBe('DIVISAO MOTORES - FABRICA - PARQUE FABRIL I -');
    const pedidos = planPreencherPedidosCadastro({
      pessoasByDocumento: new Map([[pessoa.documentoDigits, pessoa]]),
      orders: [
        {
          id: 'o-weg',
          code: 'PED-001409',
          externalOrderNumber: '4519',
          customerId: null,
          customerName: 'VIVIAN/4905',
          receiverName: 'VIVIAN/4905',
          customerDocument: null,
          deliveryCnpj: '07.175.725/0012-12',
          deliveryAddress: null,
        },
      ],
    });
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].receiverName).toBe('VIVIAN/4905');
    expect(pedidos[0].name).toEqual({
      from: 'VIVIAN/4905',
      to: 'DIVISAO MOTORES - FABRICA - PARQUE FABRIL I -',
    });
    expect(pedidos[0].address?.to).toContain('VENANCIO DA SILVA PORTO');
  });

  it('planeja criação de Customer real e vínculo de pedido pelo CNPJ de entrega', () => {
    const pessoa = mapContaAzulPessoa({
      id: 'pes-new',
      nome: 'WEG EQUIPAMENTOS ELETRICOS S/A',
      documento: '07.175.725/0012-12',
      perfis: [{ tipo_perfil: 'Cliente' }],
      endereco: enderecoCa,
    })!;
    const { mutations, pedidos } = planErpCadastroApply({
      pessoas: [pessoa],
      parties: [],
      orders: [
        {
          id: 'o-weg',
          code: 'PED-001409',
          externalOrderNumber: '4518832266',
          customerId: null,
          customerName: 'VIVIAN/4905',
          receiverName: 'VIVIAN/4905',
          customerDocument: null,
          deliveryCnpj: '07.175.725/0012-12',
          deliveryAddress: null,
        },
      ],
    });
    expect(mutations.some((m) => m.action === 'create' && m.kind === 'CUSTOMER')).toBe(
      true,
    );
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].targetCustomerId).toBeNull();
    expect(pedidos[0].name?.to).toBe('WEG EQUIPAMENTOS ELETRICOS S/A');
    expect(pedidos[0].receiverName).toBe('VIVIAN/4905');
  });

  it('atualiza Customer existente e vincula pedido já cadastrado no CNPJ', () => {
    const pessoa = mapContaAzulPessoa({
      id: 'pes-upd',
      nome: 'Oficial SA',
      documento: '11222333000181',
      perfis: ['Cliente'],
      endereco: enderecoCa,
    })!;
    const { mutations, pedidos } = planErpCadastroApply({
      pessoas: [pessoa],
      parties: [
        {
          kind: 'CUSTOMER',
          id: 'c1',
          name: 'Oficial',
          document: '11.222.333/0001-81',
          deliveryAddress: null,
        },
      ],
      orders: [
        {
          id: 'o1',
          code: 'PED-1',
          externalOrderNumber: '10',
          customerId: null,
          customerName: 'Oficial',
          receiverName: 'Recebedor',
          customerDocument: null,
          deliveryCnpj: '11222333000181',
          deliveryAddress: null,
        },
      ],
    });
    expect(mutations.some((m) => m.action === 'update' && m.kind === 'CUSTOMER')).toBe(
      true,
    );
    expect(pedidos[0].targetCustomerId).toBe('c1');
    expect(pedidos[0].customerId).toBeNull();
  });
});
