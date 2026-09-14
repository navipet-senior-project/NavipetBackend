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

  it('updates the authenticated profile display name', async () => {
    const updateProfile = vi.fn().mockResolvedValue({
      displayName: 'Professor Jane Doe',
      email: 'professor@example.com',
      role: 'professor',
    });
    app = await buildTestApp({}, {
      supabaseResources: { ...createSupabaseResources(TEST_ENV), updateProfile },
      authVerifier: { verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue(verifiedUser) },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/profiles/me',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: {
        displayName: '  Professor Jane Doe  ',
        email: 'Professor@Example.com',
        role: 'professor',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      profile: {
        displayName: 'Professor Jane Doe',
        email: 'professor@example.com',
        role: 'professor',
      },
    });
    expect(updateProfile).toHaveBeenCalledWith(
      'valid-access-token',
      verifiedUser.id,
      {
        displayName: 'Professor Jane Doe',
        email: 'professor@example.com',
        role: 'professor',
      },
    );
  });

  it('rejects unexpected profile fields', async () => {
    const updateProfile = vi.fn();
    app = await buildTestApp({}, {
      supabaseResources: { ...createSupabaseResources(TEST_ENV), updateProfile },
      authVerifier: { verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue(verifiedUser) },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/profiles/me',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: { displayName: 'Jane Doe', timezone: 'PST' },
    });

    expect(response.statusCode).toBe(422);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('rejects an invalid role', async () => {
    const updateProfile = vi.fn();
    app = await buildTestApp({}, {
      supabaseResources: { ...createSupabaseResources(TEST_ENV), updateProfile },
      authVerifier: { verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue(verifiedUser) },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/profiles/me',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: { role: 'administrator' },
    });

    expect(response.statusCode).toBe(422);
    expect(updateProfile).not.toHaveBeenCalled();
  });
});
