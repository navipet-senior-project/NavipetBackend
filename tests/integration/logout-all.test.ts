import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JwtVerifier } from '../../src/plugins/auth.js';
import { createSupabaseResources } from '../../src/plugins/supabase.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

const anyString = expect.any(String) as unknown;
const verifiedUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'student@example.com',
  sessionPurpose: 'standard' as const,
};

function verifiedVerifier(): JwtVerifier {
  return { verify: vi.fn().mockResolvedValue(verifiedUser) };
}

describe('logout-all', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('revokes every session for the authenticated user', async () => {
    const getUserById = vi.fn().mockResolvedValue({
      id: verifiedUser.id,
      email: verifiedUser.email,
      status: 'ACTIVE',
      createdAt: '2026-08-24T00:00:00.000Z',
    });
    const adminSignOut = vi.fn().mockResolvedValue(undefined);
    const supabaseResources = {
      ...createSupabaseResources(TEST_ENV),
      getUserById,
      adminSignOut,
    };
    app = await buildTestApp(
      {},
      { supabaseResources, authVerifier: verifiedVerifier() },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout-all',
      headers: { authorization: 'Bearer valid-access-token' },
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(getUserById).toHaveBeenCalledWith(verifiedUser.id);
    expect(adminSignOut).toHaveBeenCalledWith('valid-access-token', 'global');
  });

  it("does not revoke another user's sessions", async () => {
    const getUserById = vi.fn().mockResolvedValue({
      id: verifiedUser.id,
      email: verifiedUser.email,
      status: 'ACTIVE',
      createdAt: '2026-08-24T00:00:00.000Z',
    });
    const adminSignOut = vi.fn().mockResolvedValue(undefined);
    const supabaseResources = {
      ...createSupabaseResources(TEST_ENV),
      getUserById,
      adminSignOut,
    };
    app = await buildTestApp(
      {},
      { supabaseResources, authVerifier: verifiedVerifier() },
    );

    await app.inject({
      method: 'POST',
      url: '/auth/logout-all',
      headers: { authorization: 'Bearer valid-access-token' },
    });

    expect(adminSignOut).toHaveBeenCalledTimes(1);
    expect(adminSignOut).toHaveBeenCalledWith('valid-access-token', 'global');
  });

  it('returns 404 USER_NOT_FOUND when the token subject no longer exists', async () => {
    const getUserById = vi.fn().mockResolvedValue(null);
    const adminSignOut = vi.fn();
    const supabaseResources = {
      ...createSupabaseResources(TEST_ENV),
      getUserById,
      adminSignOut,
    };
    app = await buildTestApp(
      {},
      { supabaseResources, authVerifier: verifiedVerifier() },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout-all',
      headers: { authorization: 'Bearer valid-access-token' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: 'USER_NOT_FOUND', message: anyString, requestId: anyString },
    });
    expect(adminSignOut).not.toHaveBeenCalled();
  });

  it('returns 401 INVALID_ACCESS_TOKEN without a bearer token', async () => {
    app = await buildTestApp({}, { supabaseResources: createSupabaseResources(TEST_ENV) });

    const response = await app.inject({ method: 'POST', url: '/auth/logout-all' });

    expect(response.statusCode).toBe(401);
  });
});
