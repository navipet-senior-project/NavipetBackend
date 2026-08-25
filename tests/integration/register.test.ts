import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSupabaseResources } from '../../src/plugins/supabase.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

const anyString = expect.any(String) as unknown;

describe('registration', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('returns 201 with both tokens on success', async () => {
    const signUp = vi.fn().mockResolvedValue({
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'student@example.com' },
      accessToken: 'signed-access-token',
      refreshToken: 'rotating-refresh-token',
    });
    const supabaseResources = { ...createSupabaseResources(TEST_ENV), signUp };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'Student@Example.com', password: 'a-long-user-password' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      access_token: 'signed-access-token',
      refresh_token: 'rotating-refresh-token',
    });
    expect(signUp).toHaveBeenCalledWith({
      email: 'student@example.com',
      password: 'a-long-user-password',
    });
  });

  it('returns 201 with no tokens when email confirmation is pending', async () => {
    const signUp = vi.fn().mockResolvedValue({
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'student@example.com' },
      accessToken: null,
      refreshToken: null,
    });
    const supabaseResources = { ...createSupabaseResources(TEST_ENV), signUp };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'student@example.com', password: 'a-long-user-password' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({});
  });

  it('returns 409 EMAIL_ALREADY_EXISTS for a duplicate email', async () => {
    const signUp = vi.fn().mockRejectedValue({ code: 'email_exists', message: 'exists' });
    const supabaseResources = { ...createSupabaseResources(TEST_ENV), signUp };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'student@example.com', password: 'a-long-user-password' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: { code: 'EMAIL_ALREADY_EXISTS', message: anyString, requestId: anyString },
    });
  });

  it('returns 409 EMAIL_ALREADY_EXISTS when Supabase reports user_already_exists', async () => {
    const signUp = vi
      .fn()
      .mockRejectedValue({ code: 'user_already_exists', message: 'exists' });
    const supabaseResources = { ...createSupabaseResources(TEST_ENV), signUp };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'student@example.com', password: 'a-long-user-password' },
    });

    expect(response.statusCode).toBe(409);
  });

  it('returns 422 for an oversized password without calling Supabase', async () => {
    const signUp = vi.fn();
    const supabaseResources = { ...createSupabaseResources(TEST_ENV), signUp };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'student@example.com', password: 'a'.repeat(129) },
    });

    expect(response.statusCode).toBe(422);
    expect(signUp).not.toHaveBeenCalled();
  });

  it('returns 422 for a short password without calling Supabase', async () => {
    const signUp = vi.fn();
    const supabaseResources = { ...createSupabaseResources(TEST_ENV), signUp };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'student@example.com', password: 'short' },
    });

    expect(response.statusCode).toBe(422);
    expect(signUp).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_JSON for malformed JSON', async () => {
    const signUp = vi.fn();
    const supabaseResources = { ...createSupabaseResources(TEST_ENV), signUp };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'content-type': 'application/json' },
      payload: '{"email":',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_JSON' } });
    expect(signUp).not.toHaveBeenCalled();
  });

  it('returns 500 INTERNAL_ERROR for an unexpected Supabase failure', async () => {
    const signUp = vi.fn().mockRejectedValue(new Error('connection refused'));
    const supabaseResources = { ...createSupabaseResources(TEST_ENV), signUp };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'student@example.com', password: 'a-long-user-password' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: anyString, requestId: anyString },
    });
    expect(response.body).not.toContain('connection refused');
  });

  it('never returns a password field', async () => {
    const signUp = vi.fn().mockResolvedValue({
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'student@example.com' },
      accessToken: 'signed-access-token',
      refreshToken: 'rotating-refresh-token',
    });
    const supabaseResources = { ...createSupabaseResources(TEST_ENV), signUp };
    app = await buildTestApp({}, { supabaseResources });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'student@example.com', password: 'a-long-user-password' },
    });

    expect(response.body).not.toContain('a-long-user-password');
    expect(response.body).not.toContain('password');
  });
});
