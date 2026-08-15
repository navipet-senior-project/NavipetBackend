import { describe, expect, it } from 'vitest';

import { parseEnv } from '../../src/config/env.js';

const required = {
  SUPABASE_URL: 'https://project-ref.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_JWT_ISSUER: 'https://project-ref.supabase.co/auth/v1',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
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

  it('rejects a missing required Supabase value', () => {
    expect(() =>
      parseEnv({
        SUPABASE_URL: required.SUPABASE_URL,
        SUPABASE_JWT_ISSUER: required.SUPABASE_JWT_ISSUER,
        SUPABASE_JWT_AUDIENCE: required.SUPABASE_JWT_AUDIENCE,
      }),
    ).toThrow('Invalid environment configuration');
  });
});
