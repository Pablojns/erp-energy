import {
  basicAuthHeader,
  buildContaAzulAuthorizeUrl,
  expiryFromExpiresIn,
  invoiceDigits,
  isAccessTokenExpired,
  objectKeys,
} from './conta-azul.auth';

describe('conta-azul.auth', () => {
  it('monta a URL de autorização OAuth2', () => {
    const url = buildContaAzulAuthorizeUrl({
      clientId: 'abc',
      redirectUri: 'https://contaazul.com',
      state: 'st1',
    });
    expect(url.startsWith('https://auth.contaazul.com/login?')).toBe(true);
    expect(url).toContain('response_type=code');
    expect(url).toContain('client_id=abc');
    expect(url).toContain('redirect_uri=https%3A%2F%2Fcontaazul.com');
    expect(url).toContain('state=st1');
    expect(url).toContain('openid');
  });

  it('gera Basic a partir de client_id:client_secret', () => {
    expect(basicAuthHeader('id', 'secret')).toBe(
      `Basic ${Buffer.from('id:secret').toString('base64')}`,
    );
  });

  it('renova o access_token com folga antes de expirar', () => {
    const now = new Date('2026-09-10T12:00:00.000Z');
    expect(
      isAccessTokenExpired(new Date('2026-09-10T12:01:00.000Z'), now, 120_000),
    ).toBe(true);
    expect(
      isAccessTokenExpired(new Date('2026-09-10T12:05:00.000Z'), now, 120_000),
    ).toBe(false);
  });

  it('usa 3600s quando expires_in vem vazio', () => {
    const now = new Date('2026-09-10T12:00:00.000Z');
    expect(expiryFromExpiresIn(undefined, now).toISOString()).toBe(
      '2026-09-10T13:00:00.000Z',
    );
  });

  it('normaliza número da NF só com dígitos', () => {
    expect(invoiceDigits('NF-2.040')).toBe('2040');
    expect(invoiceDigits(1936)).toBe('1936');
  });

  it('lista chaves de um objeto de resposta', () => {
    expect(objectKeys({ b: 1, a: 2 })).toEqual(['a', 'b']);
  });
});
