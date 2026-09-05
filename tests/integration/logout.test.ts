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

describe('logout', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('returns 204 with an empty body and revokes only the current session', async () => {
    const adminSignOut = vi.fn().mockResolvedValue(undefined);
    const supabaseResources = { ...createSupabaseResources(TEST_ENV), adminSignOut };
    app = await buildTestApp(
      {},
      { supabaseResources, authVerifier: verifiedVerifier() },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: 'Bearer valid-access-token' },
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(adminSignOut).toHaveBeenCalledWith('valid-access-token', 'local');
  });

  it('is idempotent for an already-revoked session', async () => {
    const adminSignOut = vi.fn().mockResolvedValue(undefined);
    const supabaseResources = { ...createSupabaseResources(TEST_ENV), adminSignOut };
    app = await buildTestApp(
      {},
      { supabaseResources, authVerifier: verifiedVerifier() },
    );

    const first = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: 'Bearer valid-access-token' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: 'Bearer valid-access-token' },
    });

    expect(first.statusCode).toBe(204);
    expect(second.statusCode).toBe(204);
  });

  it('returns 401 INVALID_ACCESS_TOKEN without a bearer token', async () => {
    const adminSignOut = vi.fn();
    const supabaseResources = { ...createSupabaseResources(TEST_ENV), adminSignOut };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({ method: 'POST', url: '/auth/logout' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: 'INVALID_ACCESS_TOKEN', message: anyString, requestId: anyString },
    });
    expect(adminSignOut).not.toHaveBeenCalled();
  });
});
