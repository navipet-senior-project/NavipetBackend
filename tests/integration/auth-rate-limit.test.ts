import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSupabaseResources } from '../../src/plugins/supabase.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

describe('auth route rate limits', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('applies the stricter login rate limit before the global one', async () => {
    const supabaseResources = {
      ...createSupabaseResources(TEST_ENV),
      signInWithPassword: vi.fn().mockResolvedValue(null),
    };
    app = await buildTestApp(
      { AUTH_LOGIN_RATE_LIMIT_MAX: 1, RATE_LIMIT_MAX: 100 },
      { supabaseResources },
    );

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'student@example.com', password: 'wrong-password' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'student@example.com', password: 'wrong-password' },
    });

    expect(first.statusCode).toBe(401);
    expect(second.statusCode).toBe(429);
  });

  it('applies the stricter register rate limit before the global one', async () => {
    const supabaseResources = {
      ...createSupabaseResources(TEST_ENV),
      signUp: vi.fn().mockResolvedValue({
        user: { id: '11111111-1111-4111-8111-111111111111', email: 'student@example.com' },
        accessToken: 'signed-access-token',
        refreshToken: 'rotating-refresh-token',
      }),
    };
    app = await buildTestApp(
      { AUTH_REGISTER_RATE_LIMIT_MAX: 1, RATE_LIMIT_MAX: 100 },
      { supabaseResources },
    );

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'student@example.com', password: 'a-long-user-password' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'student@example.com', password: 'a-long-user-password' },
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(429);
  });

  it('applies the stricter refresh rate limit before the global one', async () => {
    const supabaseResources = {
      ...createSupabaseResources(TEST_ENV),
      refreshSession: vi.fn().mockRejectedValue({ code: 'refresh_token_not_found' }),
    };
    app = await buildTestApp(
      { AUTH_REFRESH_RATE_LIMIT_MAX: 1, RATE_LIMIT_MAX: 100 },
      { supabaseResources },
    );

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: 'some-token' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: 'some-token' },
    });

    expect(first.statusCode).toBe(401);
    expect(second.statusCode).toBe(429);
  });
});
