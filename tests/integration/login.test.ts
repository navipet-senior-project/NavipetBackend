import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../../src/common/errors/app-error.js';
import { ErrorCode } from '../../src/common/errors/error-codes.js';
import { createSupabaseResources } from '../../src/plugins/supabase.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

const anyString = expect.any(String) as unknown;

describe('password login', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it.each(['/auth/login', '/api/v1/auth/login'])(
    'returns Supabase tokens from %s',
    async (url) => {
      const signInWithPassword = vi.fn().mockResolvedValue({
        accessToken: 'signed-access-token',
        refreshToken: 'rotating-refresh-token',
      });
      const supabaseResources = {
        ...createSupabaseResources(TEST_ENV),
        signInWithPassword,
      };
      app = await buildTestApp({}, { supabaseResources });

      const response = await app.inject({
        method: 'POST',
        url,
        payload: {
          email: 'student@example.com',
          password: 'correct horse battery staple',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        access_token: 'signed-access-token',
        refresh_token: 'rotating-refresh-token',
      });
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: 'student@example.com',
        password: 'correct horse battery staple',
      });
    },
  );

  it('returns a generic 401 when Supabase rejects the credentials', async () => {
    const supabaseResources = {
      ...createSupabaseResources(TEST_ENV),
      signInWithPassword: vi.fn().mockResolvedValue(null),
    };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'student@example.com',
        password: 'wrong-password',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect.',
        requestId: anyString,
      },
    });
  });

  it('returns 403 ACCOUNT_DISABLED for a banned account with correct credentials', async () => {
    const supabaseResources = {
      ...createSupabaseResources(TEST_ENV),
      signInWithPassword: vi.fn().mockRejectedValue({
        code: 'user_banned',
        message: 'User is banned',
      }),
    };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'student@example.com',
        password: 'correct horse battery staple',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: 'ACCOUNT_DISABLED',
        message: anyString,
        requestId: anyString,
      },
    });
  });

  it('hides upstream Supabase failures behind a generic 502 response', async () => {
    const upstreamDetail = 'Supabase connection refused at secret host';
    const supabaseResources = {
      ...createSupabaseResources(TEST_ENV),
      signInWithPassword: vi.fn().mockRejectedValue(new Error(upstreamDetail)),
    };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'student@example.com',
        password: 'correct horse battery staple',
      },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        requestId: anyString,
      },
    });
    expect(response.body).not.toContain(upstreamDetail);
  });

  it('normalizes rejected AppErrors to the same safe 502 response', async () => {
    const upstreamDetail = 'Leaked upstream authorization detail';
    const supabaseResources = {
      ...createSupabaseResources(TEST_ENV),
      signInWithPassword: vi.fn().mockRejectedValue(
        new AppError({
          code: ErrorCode.FORBIDDEN,
          statusCode: 403,
          message: upstreamDetail,
        }),
      ),
    };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'student@example.com',
        password: 'correct horse battery staple',
      },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        requestId: anyString,
      },
    });
    expect(response.body).not.toContain(upstreamDetail);
  });

  it('rejects a missing password before calling Supabase', async () => {
    const signInWithPassword = vi.fn();
    const supabaseResources = {
      ...createSupabaseResources(TEST_ENV),
      signInWithPassword,
    };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'student@example.com' },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        requestId: anyString,
      },
    });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('rejects a malformed email before calling Supabase', async () => {
    const signInWithPassword = vi.fn();
    const supabaseResources = {
      ...createSupabaseResources(TEST_ENV),
      signInWithPassword,
    };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'not-an-email', password: 'password' },
    });

    expect(response.statusCode).toBe(422);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});

describe('password login documentation', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('shows readable email and password examples in OpenAPI', async () => {
    app = await buildTestApp({ DOCS_ENABLED: true });

    const response = await app.inject({ method: 'GET', url: '/docs/json' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      paths: {
        '/api/v1/auth/login': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    properties: {
                      email: { example: 'student@example.com' },
                      password: { example: 'password' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  });
});

describe('Supabase password login gateway', () => {
  it('maps Supabase invalid credentials to a denied login', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error_code: 'invalid_credentials',
          message: 'Invalid login credentials',
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ),
    );
    const resources = createSupabaseResources(TEST_ENV);

    await expect(
      resources.signInWithPassword({
        email: 'student@example.com',
        password: 'wrong-password',
      }),
    ).resolves.toBeNull();
  });

  it('does not attach a successful login session to the shared public client', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'signed-access-token',
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: 2_000_000_000,
            refresh_token: 'rotating-refresh-token',
            user: {
              id: '11111111-1111-4111-8111-111111111111',
              aud: 'authenticated',
              role: 'authenticated',
              email: 'student@example.com',
              phone: '',
              app_metadata: { provider: 'email', providers: ['email'] },
              user_metadata: {},
              identities: [],
              created_at: '2026-08-24T00:00:00.000Z',
              updated_at: '2026-08-24T00:00:00.000Z',
              is_anonymous: false,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response('[]', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    const resources = createSupabaseResources(TEST_ENV);

    await expect(
      resources.signInWithPassword({
        email: 'student@example.com',
        password: 'correct horse battery staple',
      }),
    ).resolves.toEqual({
      accessToken: 'signed-access-token',
      refreshToken: 'rotating-refresh-token',
    });

    await resources.publicClient.from('public_content').select('*');

    const publicRequestInit = fetchSpy.mock.calls[1]?.[1];
    expect(new Headers(publicRequestInit?.headers).get('authorization')).toBe(
      `Bearer ${TEST_ENV.SUPABASE_ANON_KEY}`,
    );
  });

  it('does not classify Supabase rate limiting as invalid credentials', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error_code: 'over_request_rate_limit',
          message: 'Too many requests',
        }),
        { status: 429, headers: { 'content-type': 'application/json' } },
      ),
    );
    const resources = createSupabaseResources(TEST_ENV);

    await expect(
      resources.signInWithPassword({
        email: 'student@example.com',
        password: 'password',
      }),
    ).rejects.toMatchObject({
      code: 'over_request_rate_limit',
      status: 429,
    });
  });
});
