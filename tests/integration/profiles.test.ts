import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JwtVerifier } from '../../src/plugins/auth.js';
import { createSupabaseResources } from '../../src/plugins/supabase.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

const verifiedUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'student@example.com',
  sessionPurpose: 'standard' as const,
};

describe('profiles', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => app?.close());

  it('returns the authenticated profile fields', async () => {
    const getProfileByUserId = vi.fn().mockResolvedValue({
      displayName: 'Jane Doe',
      email: 'student@example.com',
      role: 'student',
    });
    app = await buildTestApp({}, {
      supabaseResources: { ...createSupabaseResources(TEST_ENV), getProfileByUserId },
      authVerifier: { verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue(verifiedUser) },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/profiles/me',
      headers: { authorization: 'Bearer valid-access-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      profile: { displayName: 'Jane Doe', email: 'student@example.com', role: 'student' },
    });
    expect(getProfileByUserId).toHaveBeenCalledWith('valid-access-token');
  });

  it('requires authentication', async () => {
    app = await buildTestApp({}, { supabaseResources: createSupabaseResources(TEST_ENV) });
    const response = await app.inject({ method: 'GET', url: '/profiles/me' });
    expect(response.statusCode).toBe(401);
  });

  it('returns 404 when the profile does not exist', async () => {
    app = await buildTestApp({}, {
      supabaseResources: {
        ...createSupabaseResources(TEST_ENV),
        getProfileByUserId: vi.fn().mockResolvedValue(null),
      },
      authVerifier: { verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue(verifiedUser) },
    });
    const response = await app.inject({
      method: 'GET',
      url: '/profiles/me',
      headers: { authorization: 'Bearer valid-access-token' },
    });
    expect(response.statusCode).toBe(404);
  });
});
