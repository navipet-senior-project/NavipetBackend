import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { AppError } from '../../src/common/errors/app-error.js';
import { ErrorCode } from '../../src/common/errors/error-codes.js';
import {
  SupabaseJwtVerifier,
  type JwtVerifier,
} from '../../src/plugins/auth.js';
import { createSupabaseResources } from '../../src/plugins/supabase.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

const anyString = expect.any(String) as unknown;

async function protectedApp(verifier: JwtVerifier): Promise<FastifyInstance> {
  const app = await buildTestApp({}, { authVerifier: verifier });
  app.get(
    '/__test/protected',
    { preHandler: app.authenticate },
    (request) => ({ user: request.user }),
  );
  return app;
}

describe('authentication guard', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it.each([
    undefined,
    'Basic abc',
    'Bearer',
    'Bearer abc extra',
    'Bearer abc, Bearer def',
  ])('rejects malformed authorization value %s', async (authorization) => {
    const verifier: JwtVerifier = {
      verify: vi.fn<JwtVerifier['verify']>(),
    };
    app = await protectedApp(verifier);

    const response = await app.inject({
      method: 'GET',
      url: '/__test/protected',
      headers: authorization === undefined ? {} : { authorization },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Authentication required',
        requestId: anyString,
      },
    });
  });

  it('sets a verified user and keeps the token internal', async () => {
    const verifier: JwtVerifier = {
      verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        email: 'student@example.com',
      }),
    };
    app = await protectedApp(verifier);

    const response = await app.inject({
      method: 'GET',
      url: '/__test/protected',
      headers: { authorization: 'Bearer signed-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'student@example.com',
      },
    });
    expect(response.body).not.toContain('signed-token');
    expect(verifier.verify).toHaveBeenCalledWith('signed-token');
  });

  it('accepts a verified anonymous user without email', async () => {
    const verifier: JwtVerifier = {
      verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue({
        id: '22222222-2222-4222-8222-222222222222',
      }),
    };
    app = await protectedApp(verifier);

    const response = await app.inject({
      method: 'GET',
      url: '/__test/protected',
      headers: { authorization: 'Bearer anonymous-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: { id: '22222222-2222-4222-8222-222222222222' },
    });
  });

  it('normalizes a gateway AppError to a safe unauthorized response', async () => {
    const secretMessage = 'custom gateway database detail';
    const verifier = new SupabaseJwtVerifier(
      {
        getClaims: vi.fn().mockRejectedValue(
          new AppError({
            code: ErrorCode.DATABASE_ERROR,
            statusCode: 503,
            message: secretMessage,
            cause: new Error('custom gateway cause'),
          }),
        ),
      },
      TEST_ENV.SUPABASE_JWT_ISSUER,
      TEST_ENV.SUPABASE_JWT_AUDIENCE,
    );
    app = await protectedApp(verifier);

    const response = await app.inject({
      method: 'GET',
      url: '/__test/protected',
      headers: { authorization: 'Bearer gateway-failure-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Authentication required',
        requestId: anyString,
      },
    });
    expect(response.body).not.toContain(secretMessage);
    expect(response.body).not.toContain('custom gateway cause');
    expect(response.body).not.toContain('gateway-failure-token');
  });
});

describe('SupabaseJwtVerifier', () => {
  const validClaims = {
    sub: '33333333-3333-4333-8333-333333333333',
    email: 'student@example.com',
    iss: TEST_ENV.SUPABASE_JWT_ISSUER,
    aud: TEST_ENV.SUPABASE_JWT_AUDIENCE,
    exp: 2_000_000_000,
  };

  it('maps valid verified claims', async () => {
    const verifier = new SupabaseJwtVerifier(
      { getClaims: vi.fn().mockResolvedValue(validClaims) },
      TEST_ENV.SUPABASE_JWT_ISSUER,
      TEST_ENV.SUPABASE_JWT_AUDIENCE,
      () => 1_900_000_000_000,
    );

    await expect(verifier.verify('token')).resolves.toEqual({
      id: validClaims.sub,
      email: validClaims.email,
    });
  });

  it('accepts anonymous claims with a valid array audience', async () => {
    const anonymousClaims = {
      sub: '44444444-4444-4444-8444-444444444444',
      iss: TEST_ENV.SUPABASE_JWT_ISSUER,
      aud: ['anon', TEST_ENV.SUPABASE_JWT_AUDIENCE],
      exp: 2_000_000_000,
    };
    const verifier = new SupabaseJwtVerifier(
      { getClaims: vi.fn().mockResolvedValue(anonymousClaims) },
      TEST_ENV.SUPABASE_JWT_ISSUER,
      TEST_ENV.SUPABASE_JWT_AUDIENCE,
      () => 1_900_000_000_000,
    );

    await expect(verifier.verify('anonymous-token')).resolves.toEqual({
      id: anonymousClaims.sub,
    });
  });

  it.each([
    { name: 'invalid subject', claims: { ...validClaims, sub: 'not-a-uuid' } },
    {
      name: 'issuer mismatch',
      claims: { ...validClaims, iss: 'https://attacker.invalid/auth/v1' },
    },
    {
      name: 'audience mismatch',
      claims: { ...validClaims, aud: 'service_role' },
    },
    { name: 'expired token', claims: { ...validClaims, exp: 1_800_000_000 } },
  ])('rejects $name', async ({ claims }) => {
    const verifier = new SupabaseJwtVerifier(
      { getClaims: vi.fn().mockResolvedValue(claims) },
      TEST_ENV.SUPABASE_JWT_ISSUER,
      TEST_ENV.SUPABASE_JWT_AUDIENCE,
      () => 1_900_000_000_000,
    );

    await expect(verifier.verify('token')).rejects.toMatchObject({
      code: ErrorCode.INVALID_ACCESS_TOKEN,
      statusCode: 401,
    });
  });

  it('hides Supabase verification failures', async () => {
    const verifier = new SupabaseJwtVerifier(
      { getClaims: vi.fn().mockRejectedValue(new Error('upstream detail')) },
      TEST_ENV.SUPABASE_JWT_ISSUER,
      TEST_ENV.SUPABASE_JWT_AUDIENCE,
    );

    await expect(verifier.verify('token')).rejects.toMatchObject({
      code: ErrorCode.INVALID_ACCESS_TOKEN,
      statusCode: 401,
      message: 'Authentication required',
      cause: expect.any(Error) as unknown,
    });
  });
});

describe('Supabase resource boundary', () => {
  it('keeps admin access optional and creates user-scoped clients separately', () => {
    const withoutAdmin = createSupabaseResources(TEST_ENV);
    const withAdmin = createSupabaseResources({
      ...TEST_ENV,
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    });

    expect(withoutAdmin.adminClient).toBeNull();
    expect(withAdmin.adminClient).not.toBeNull();
    expect(withoutAdmin.forAccessToken('user-token')).not.toBe(
      withoutAdmin.publicClient,
    );
  });

  it('sends the exact bearer authorization from a user-scoped client', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('[]', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const resources = createSupabaseResources(TEST_ENV);

    const result = await resources
      .forAccessToken('user-scoped-token')
      .from('profiles')
      .select('*');

    expect(result.error).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestInit = fetchSpy.mock.calls[0]?.[1];
    expect(new Headers(requestInit?.headers).get('authorization')).toBe(
      'Bearer user-scoped-token',
    );
  });
});
