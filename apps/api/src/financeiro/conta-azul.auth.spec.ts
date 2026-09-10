import {
  basicAuthHeader,
  buildContaAzulAuthorizeUrl,
  decideAfterInvalidGrant,
  expiryFromExpiresIn,
  fromDbSessionTimestamp,
  invoiceDigits,
  isAccessTokenExpired,
  isContaAzulInvalidGrant,
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

  it('reinterpreta TIMESTAMP sem fuso no timezone do processo', () => {
    const naive = new Date('2026-09-10T18:30:00.000Z');
    const instant = fromDbSessionTimestamp(naive);
    expect(instant.getTime()).toBe(
      naive.getTime() - naive.getTimezoneOffset() * 60_000,
    );
  });

  it('normaliza número da NF só com dígitos', () => {
    expect(invoiceDigits('NF-2.040')).toBe('2040');
    expect(invoiceDigits(1936)).toBe('1936');
  });

  it('lista chaves de um objeto de resposta', () => {
    expect(objectKeys({ b: 1, a: 2 })).toEqual(['a', 'b']);
  });

  it('detecta invalid_grant em corpo OAuth e em Error envelopado', () => {
    expect(isContaAzulInvalidGrant({ error: 'invalid_grant' })).toBe(true);
    expect(
      isContaAzulInvalidGrant(
        new Error('Falha OAuth Conta Azul: invalid_grant'),
      ),
    ).toBe(true);
    expect(isContaAzulInvalidGrant('network timeout')).toBe(false);
  });

  it('após invalid_grant reusa o access do banco se outra instância já renovou', () => {
    const now = new Date('2026-09-10T12:00:00.000Z');
    expect(
      decideAfterInvalidGrant({
        usedRefreshToken: 'old',
        loaded: {
          refreshToken: 'new',
          expiresAt: new Date('2026-09-10T13:00:00.000Z'),
        },
        now,
      }),
    ).toBe('use_session');
  });

  it('após invalid_grant tenta o refresh_token novo se o access já expirou', () => {
    const now = new Date('2026-09-10T12:00:00.000Z');
    expect(
      decideAfterInvalidGrant({
        usedRefreshToken: 'old',
        loaded: {
          refreshToken: 'new',
          expiresAt: new Date('2026-09-10T12:00:30.000Z'),
        },
        now,
      }),
    ).toBe('retry_refresh');
  });

  it('após invalid_grant pede reauth só se o refresh do banco é o mesmo que falhou', () => {
    const now = new Date('2026-09-10T12:00:00.000Z');
    expect(
      decideAfterInvalidGrant({
        usedRefreshToken: 'old',
        loaded: {
          refreshToken: 'old',
          expiresAt: new Date('2026-09-10T12:00:30.000Z'),
        },
        now,
      }),
    ).toBe('reauth');
    expect(
      decideAfterInvalidGrant({
        usedRefreshToken: 'old',
        loaded: null,
        now,
      }),
    ).toBe('reauth');
  });
});
