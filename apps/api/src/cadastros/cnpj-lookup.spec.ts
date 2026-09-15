import { mapBrasilApiCnpj, mapReceitaWsCnpj } from './cnpj-lookup';

describe('cnpj-lookup mappers', () => {
  it('mapeia BrasilAPI com tipo de logradouro', () => {
    const mapped = mapBrasilApiCnpj(
      {
        cnpj: '48783884000124',
        razao_social: 'ENERGY BRANDS COMERCIO E SERVICOS LTDA',
        nome_fantasia: 'ENERGY BRANDS',
        cep: '13076050',
        descricao_tipo_de_logradouro: 'RUA',
        logradouro: 'AMELIA BUENO',
        numero: '179',
        bairro: 'TAQUARAL',
        municipio: 'CAMPINAS',
        uf: 'SP',
        complemento: '',
      },
      '48783884000124',
    );
    expect(mapped).toMatchObject({
      razaoSocial: 'ENERGY BRANDS COMERCIO E SERVICOS LTDA',
      logradouro: 'RUA AMELIA BUENO',
      cidade: 'CAMPINAS',
      uf: 'SP',
      cep: '13076050',
      numero: '179',
      source: 'brasilapi',
    });
  });

  it('não duplica o tipo quando o logradouro já inclui RUA', () => {
    const mapped = mapBrasilApiCnpj(
      {
        cnpj: '48783884000124',
        razao_social: 'ENERGY BRANDS COMERCIO E SERVICOS LTDA',
        logradouro: 'RUA AMELIA BUENO',
        descricao_tipo_de_logradouro: 'RUA',
        municipio: 'CAMPINAS',
        uf: 'SP',
      },
      '48783884000124',
    );
    expect(mapped?.logradouro).toBe('RUA AMELIA BUENO');
  });

  it('mapeia ReceitaWS e rejeita status ERROR', () => {
    expect(
      mapReceitaWsCnpj({ status: 'ERROR', message: 'CNPJ inválido' }, '1'.repeat(14)),
    ).toBeNull();
    const mapped = mapReceitaWsCnpj(
      {
        status: 'OK',
        cnpj: '48.783.884/0001-24',
        nome: 'ENERGY BRANDS COMERCIO E SERVICOS LTDA',
        fantasia: 'ENERGY BRANDS',
        cep: '13.076-050',
        logradouro: 'RUA AMELIA BUENO',
        numero: '179',
        bairro: 'TAQUARAL',
        municipio: 'CAMPINAS',
        uf: 'SP',
      },
      '48783884000124',
    );
    expect(mapped).toMatchObject({
      razaoSocial: 'ENERGY BRANDS COMERCIO E SERVICOS LTDA',
      cep: '13076050',
      source: 'receitaws',
    });
  });
});
