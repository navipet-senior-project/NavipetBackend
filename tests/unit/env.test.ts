import { describe, expect, it } from 'vitest';

import { parseEnv } from '../../src/config/env.js';

const required = {
  SUPABASE_URL: 'https://project-ref.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_JWT_ISSUER: 'https://project-ref.supabase.co/auth/v1',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  AUTH_EMAIL_REDIRECT_URL: 'navipet://auth-callback',
};

describe('parseEnv', () => {
  it('applies development defaults and normalizes origins', () => {
    const env = parseEnv({
      ...required,
      CORS_ORIGINS: 'https://app.example.com, http://localhost:5173 ',
    });

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      HOST: '0.0.0.0',
      LOG_LEVEL: 'info',
      BODY_LIMIT_BYTES: 1_048_576,
      RATE_LIMIT_MAX: 100,
      RATE_LIMIT_WINDOW: '1 minute',
      DOCS_ENABLED: true,
      CORS_ORIGINS: [
        'https://app.example.com',
        'http://localhost:5173',
      ],
    });
    expect(Object.isFrozen(env)).toBe(true);
    expect(Object.isFrozen(env.CORS_ORIGINS)).toBe(true);
  });

  it('disables docs by default in production', () => {
    expect(parseEnv({ ...required, NODE_ENV: 'production' }).DOCS_ENABLED).toBe(
      false,
    );
  });

  it('honors an explicit docs override', () => {
    expect(
      parseEnv({ ...required, NODE_ENV: 'production', DOCS_ENABLED: 'true' })
        .DOCS_ENABLED,
    ).toBe(true);
  });

  it.each([
    ['http://localhost:1', '1ms'],
    ['https://project-ref.supabase.co:65535/path?region=west', '.5 seconds'],
  ])(
    'accepts HTTP URL and rate-window boundaries %s and %s',
    (supabaseUrl, rateLimitWindow) => {
      const env = parseEnv({
        ...required,
        SUPABASE_URL: supabaseUrl,
        RATE_LIMIT_WINDOW: rateLimitWindow,
      });

      expect(env.SUPABASE_URL).toBe(supabaseUrl);
      expect(env.RATE_LIMIT_WINDOW).toBe(rateLimitWindow);
    },
  );

  it.each([
    ['SUPABASE_URL', 'https://?broken'],
    ['SUPABASE_JWT_ISSUER', 'http://#missing-host'],
    ['MULTISET_API_BASE_URL', 'https://example.com:65536'],
    ['CORS_ORIGINS', 'https://valid.example,https://?broken'],
  ])('rejects semantically invalid HTTP URL in %s', (key, value) => {
    expect(() => parseEnv({ ...required, [key]: value })).toThrow(
      'Invalid environment configuration',
    );
  });

  it.each(['bananas', '0ms', '-1 second', '1 fortnight'])(
    'rejects invalid rate-limit window %s',
    (value) => {
      expect(() => parseEnv({ ...required, RATE_LIMIT_WINDOW: value })).toThrow(
        'Invalid environment configuration',
      );
    },
  );

  it.each([
    ['PORT', '0'],
    ['PORT', '65536'],
    ['BODY_LIMIT_BYTES', 'abc'],
    ['RATE_LIMIT_MAX', '-1'],
    ['DOCS_ENABLED', 'sometimes'],
    ['SUPABASE_URL', 'ftp://project-ref.invalid'],
    ['SUPABASE_JWT_ISSUER', 'not-a-url'],
    ['CORS_ORIGINS', 'javascript:alert(1)'],
  ])('rejects invalid %s', (key, value) => {
    expect(() => parseEnv({ ...required, [key]: value })).toThrow(
      'Invalid environment configuration',
    );
  });

  it('defaults the auth rate-limit variables when unset', () => {
    const env = parseEnv(required);

    expect(env.AUTH_LOGIN_RATE_LIMIT_MAX).toBe(10);
    expect(env.AUTH_LOGIN_RATE_LIMIT_WINDOW).toBe('1 minute');
    expect(env.AUTH_REGISTER_RATE_LIMIT_MAX).toBe(5);
    expect(env.AUTH_REGISTER_RATE_LIMIT_WINDOW).toBe('1 hour');
    expect(env.AUTH_REFRESH_RATE_LIMIT_MAX).toBe(30);
    expect(env.AUTH_REFRESH_RATE_LIMIT_WINDOW).toBe('1 minute');
  });

  it('rejects an invalid auth rate-limit window', () => {
    expect(() =>
      parseEnv({ ...required, AUTH_LOGIN_RATE_LIMIT_WINDOW: 'not-a-window' }),
    ).toThrow('Invalid environment configuration');
  });

  it('rejects a missing required Supabase value', () => {
    expect(() =>
      parseEnv({
        SUPABASE_URL: required.SUPABASE_URL,
        SUPABASE_JWT_ISSUER: required.SUPABASE_JWT_ISSUER,
        SUPABASE_JWT_AUDIENCE: required.SUPABASE_JWT_AUDIENCE,
      }),
    ).toThrow('Invalid environment configuration');
  });

  it('accepts the documented AUTH_EMAIL_REDIRECT_URL value', () => {
    expect(parseEnv(required).AUTH_EMAIL_REDIRECT_URL).toBe(
      'navipet://auth-callback',
    );
  });

  it('rejects a missing AUTH_EMAIL_REDIRECT_URL', () => {
    const { AUTH_EMAIL_REDIRECT_URL: _omit, ...withoutRedirect } = required;
    expect(() => parseEnv(withoutRedirect)).toThrow(
      'Invalid environment configuration',
    );
  });

  it('rejects an AUTH_EMAIL_REDIRECT_URL that is not the documented value', () => {
    expect(() =>
      parseEnv({ ...required, AUTH_EMAIL_REDIRECT_URL: 'https://example.com' }),
    ).toThrow('Invalid environment configuration');
  });
});
