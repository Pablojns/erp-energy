import { BadRequestException, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { CnpjLookupService } from './cnpj-lookup.service';

jest.mock('axios');

const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;

const ENERGY_CNPJ = '48783884000124';

const brasilApiBody = {
  cnpj: ENERGY_CNPJ,
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
};

const receitaWsBody = {
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
};

describe('CnpjLookupService', () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it('rejeita CNPJ com tamanho inválido', async () => {
    const svc = new CnpjLookupService();
    await expect(svc.lookup('123')).rejects.toBeInstanceOf(BadRequestException);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('usa BrasilAPI como fonte principal', async () => {
    mockedGet.mockResolvedValueOnce({ status: 200, data: brasilApiBody });
    const svc = new CnpjLookupService();
    const result = await svc.lookup(ENERGY_CNPJ);
    expect(result).toMatchObject({
      razaoSocial: 'ENERGY BRANDS COMERCIO E SERVICOS LTDA',
      cidade: 'CAMPINAS',
      uf: 'SP',
      source: 'brasilapi',
    });
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(String(mockedGet.mock.calls[0]?.[0])).toContain('brasilapi.com.br');
    expect(String(mockedGet.mock.calls[0]?.[0])).not.toContain('contaazul');
  });

  it('cai para ReceitaWS se a BrasilAPI estiver indisponível', async () => {
    mockedGet
      .mockResolvedValueOnce({ status: 503, data: {} })
      .mockResolvedValueOnce({ status: 200, data: receitaWsBody });
    const svc = new CnpjLookupService();
    const result = await svc.lookup(ENERGY_CNPJ);
    expect(result.source).toBe('receitaws');
    expect(result.razaoSocial).toBe('ENERGY BRANDS COMERCIO E SERVICOS LTDA');
    expect(String(mockedGet.mock.calls[1]?.[0])).toContain('receitaws.com.br');
  });

  it('reusa cache e não chama as APIs de novo', async () => {
    mockedGet.mockResolvedValueOnce({ status: 200, data: brasilApiBody });
    const svc = new CnpjLookupService();
    await svc.lookup(ENERGY_CNPJ);
    await svc.lookup(ENERGY_CNPJ);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('falha de forma discreta quando as duas APIs falham', async () => {
    mockedGet
      .mockResolvedValueOnce({ status: 500, data: {} })
      .mockResolvedValueOnce({ status: 429, data: {} });
    const svc = new CnpjLookupService();
    await expect(svc.lookup(ENERGY_CNPJ)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
