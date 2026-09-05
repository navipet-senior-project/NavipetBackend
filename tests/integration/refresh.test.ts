import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSupabaseResources } from '../../src/plugins/supabase.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

const anyString = expect.any(String) as unknown;

describe('refresh', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('rotates a valid refresh token', async () => {
    const refreshSession = vi.fn().mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      userId: '11111111-1111-4111-8111-111111111111',
    });
    const supabaseResources = { ...createSupabaseResources(TEST_ENV), refreshSession };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'old-refresh-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
    });
    expect(refreshSession).toHaveBeenCalledWith('old-refresh-token');
  });

  it('the replacement refresh token differs from the original', async () => {
    const refreshSession = vi.fn().mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      userId: '11111111-1111-4111-8111-111111111111',
    });
    const supabaseResources = { ...createSupabaseResources(TEST_ENV), refreshSession };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'old-refresh-token' },
    });

    expect(response.json()).not.toMatchObject({ refresh_token: 'old-refresh-token' });
  });

  it('returns 401 INVALID_REFRESH_TOKEN for an unknown token', async () => {
    const refreshSession = vi
      .fn()
      .mockRejectedValue({ code: 'refresh_token_not_found', message: 'not found' });
    const supabaseResources = { ...createSupabaseResources(TEST_ENV), refreshSession };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'random-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: 'INVALID_REFRESH_TOKEN', message: anyString, requestId: anyString },
    });
  });

  it('returns 401 INVALID_REFRESH_TOKEN when Supabase marks the session non-refreshable', async () => {
    const refreshSession = vi
      .fn()
      .mockRejectedValue({ code: 'session_purpose_not_refreshable' });
    const supabaseResources = { ...createSupabaseResources(TEST_ENV), refreshSession };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'recovery-refresh-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_REFRESH_TOKEN' } });
  });

  it('returns 401 INVALID_REFRESH_TOKEN for an expired session', async () => {
    const refreshSession = vi
      .fn()
      .mockRejectedValue({ code: 'session_expired', message: 'expired' });
    const supabaseResources = { ...createSupabaseResources(TEST_ENV), refreshSession };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'expired-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_REFRESH_TOKEN' } });
  });

  it('returns 401 REFRESH_TOKEN_REUSED for a consumed token', async () => {
    const refreshSession = vi
      .fn()
      .mockRejectedValue({ code: 'refresh_token_already_used', message: 'used' });
    const supabaseResources = { ...createSupabaseResources(TEST_ENV), refreshSession };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'consumed-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: 'REFRESH_TOKEN_REUSED', message: anyString, requestId: anyString },
    });
  });

  it('returns 422 when the refresh token is missing', async () => {
    const refreshSession = vi.fn();
    const supabaseResources = { ...createSupabaseResources(TEST_ENV), refreshSession };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {},
    });

    expect(response.statusCode).toBe(422);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('returns 500 INTERNAL_ERROR for an unexpected failure', async () => {
    const refreshSession = vi.fn().mockRejectedValue(new Error('connection refused'));
    const supabaseResources = { ...createSupabaseResources(TEST_ENV), refreshSession };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'some-token' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('connection refused');
  });
});
