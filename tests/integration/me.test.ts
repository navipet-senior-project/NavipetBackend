import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JwtVerifier } from '../../src/plugins/auth.js';
import { createSupabaseResources } from '../../src/plugins/supabase.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

const anyString = expect.any(String) as unknown;
const verifiedUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'student@example.com',
};

function verifiedVerifier(): JwtVerifier {
  return { verify: vi.fn().mockResolvedValue(verifiedUser) };
}

describe('me', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('returns the authenticated user without password or session data', async () => {
    const getUserById = vi.fn().mockResolvedValue({
      id: verifiedUser.id,
      email: verifiedUser.email,
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const supabaseResources = { ...createSupabaseResources(TEST_ENV), getUserById };
    app = await buildTestApp(
      {},
      { supabaseResources, authVerifier: verifiedVerifier() },
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: 'Bearer valid-access-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        id: verifiedUser.id,
        email: verifiedUser.email,
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    expect(response.body).not.toContain('passwordHash');
    expect(response.body).not.toContain('valid-access-token');
  });

  it('returns 403 ACCOUNT_DISABLED for a disabled account', async () => {
    const getUserById = vi.fn().mockResolvedValue({
      id: verifiedUser.id,
      email: verifiedUser.email,
      status: 'DISABLED',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const supabaseResources = { ...createSupabaseResources(TEST_ENV), getUserById };
    app = await buildTestApp(
      {},
      { supabaseResources, authVerifier: verifiedVerifier() },
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: 'Bearer valid-access-token' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: { code: 'ACCOUNT_DISABLED', message: anyString, requestId: anyString },
    });
  });

  it('returns 404 USER_NOT_FOUND for a deleted user', async () => {
    const getUserById = vi.fn().mockResolvedValue(null);
    const supabaseResources = { ...createSupabaseResources(TEST_ENV), getUserById };
    app = await buildTestApp(
      {},
      { supabaseResources, authVerifier: verifiedVerifier() },
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: 'Bearer valid-access-token' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: 'USER_NOT_FOUND', message: anyString, requestId: anyString },
    });
  });

  it('returns 401 INVALID_ACCESS_TOKEN without a bearer token', async () => {
    app = await buildTestApp({}, { supabaseResources: createSupabaseResources(TEST_ENV) });

    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });

    expect(response.statusCode).toBe(401);
  });
});
