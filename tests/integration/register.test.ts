import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSupabaseResources, type RegisterGateway } from '../../src/plugins/supabase.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

const anyString = expect.any(String) as unknown;

const validPayload = {
  firstName: 'Elbee',
  lastName: 'Shark',
  email: 'student@example.com',
  password: 'Password1!',
};

function buildAppWithSignUp(
  signUp: ReturnType<typeof vi.fn<RegisterGateway['signUp']>>,
) {
  const supabaseResources = { ...createSupabaseResources(TEST_ENV), signUp };
  return buildTestApp({}, { supabaseResources });
}

describe('registration', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('returns 200 with the confirmation message on success', async () => {
    const signUp = vi.fn<RegisterGateway['signUp']>().mockResolvedValue({
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'student@example.com' },
      accessToken: null,
      refreshToken: null,
    });
    app = await buildAppWithSignUp(signUp);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      message: 'Verification code sent. Check your inbox.',
      otp_required: true,
    });
  });

  it('normalizes email by trimming and lowercasing before calling Supabase', async () => {
    const signUp = vi.fn<RegisterGateway['signUp']>().mockResolvedValue({
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'student@example.com' },
      accessToken: null,
      refreshToken: null,
    });
    app = await buildAppWithSignUp(signUp);

    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { ...validPayload, email: '  Student@Example.com  ' },
    });

    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'student@example.com' }),
    );
  });

  it('forwards firstName, lastName, email, and password to the signUp gateway', async () => {
    const signUp = vi.fn<RegisterGateway['signUp']>().mockResolvedValue({
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'student@example.com' },
      accessToken: null,
      refreshToken: null,
    });
    app = await buildAppWithSignUp(signUp);

    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: validPayload,
    });

    expect(signUp).toHaveBeenCalledWith({
      email: 'student@example.com',
      password: 'Password1!',
      firstName: 'Elbee',
      lastName: 'Shark',
    });
  });

  it('response never contains access_token or refresh_token', async () => {
    const signUp = vi.fn<RegisterGateway['signUp']>().mockResolvedValue({
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'student@example.com' },
      accessToken: null,
      refreshToken: null,
    });
    app = await buildAppWithSignUp(signUp);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: validPayload,
    });

    expect(response.body).not.toContain('access_token');
    expect(response.body).not.toContain('refresh_token');
  });

  it('never returns a password field', async () => {
    const signUp = vi.fn<RegisterGateway['signUp']>().mockResolvedValue({
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'student@example.com' },
      accessToken: null,
      refreshToken: null,
    });
    app = await buildAppWithSignUp(signUp);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: validPayload,
    });

    expect(response.body).not.toContain('Password1!');
    expect(response.body).not.toContain('password');
  });

  it('returns 409 EMAIL_ALREADY_EXISTS for a duplicate email', async () => {
    const signUp = vi.fn<RegisterGateway['signUp']>().mockRejectedValue({ code: 'email_exists', message: 'exists' });
    app = await buildAppWithSignUp(signUp);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: validPayload,
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
    app = await buildAppWithSignUp(signUp);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: validPayload,
    });

    expect(response.statusCode).toBe(409);
  });

  it.each(['over_email_send_rate_limit', 'over_request_rate_limit'])(
    'returns 429 RATE_LIMITED when Supabase reports %s',
    async (code) => {
      const signUp = vi.fn<RegisterGateway['signUp']>().mockRejectedValue({ code, message: 'rate limited' });
      app = await buildAppWithSignUp(signUp);

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: validPayload,
      });

      expect(response.statusCode).toBe(429);
      expect(response.json()).toEqual({
        error: { code: 'RATE_LIMITED', message: anyString, requestId: anyString },
      });
    },
  );

  it('returns 422 when Supabase reports weak_password', async () => {
    const signUp = vi.fn<RegisterGateway['signUp']>().mockRejectedValue({ code: 'weak_password', message: 'weak' });
    app = await buildAppWithSignUp(signUp);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: validPayload,
    });

    expect(response.statusCode).toBe(422);
  });

  it('returns 400 INVALID_JSON for malformed JSON', async () => {
    const signUp = vi.fn<RegisterGateway['signUp']>();
    app = await buildAppWithSignUp(signUp);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { 'content-type': 'application/json' },
      payload: '{"email":',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_JSON' } });
    expect(signUp).not.toHaveBeenCalled();
  });

  it('returns 500 INTERNAL_ERROR for an unexpected Supabase failure', async () => {
    const signUp = vi.fn<RegisterGateway['signUp']>().mockRejectedValue(new Error('connection refused'));
    app = await buildAppWithSignUp(signUp);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: validPayload,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: anyString, requestId: anyString },
    });
    expect(response.body).not.toContain('connection refused');
  });

  describe('firstName validation', () => {
    it.each([
      ['empty string', ''],
      ['whitespace only', '   '],
      ['too long', 'a'.repeat(51)],
    ])('returns 422 for %s without calling Supabase', async (_label, firstName) => {
      const signUp = vi.fn<RegisterGateway['signUp']>();
      app = await buildAppWithSignUp(signUp);

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { ...validPayload, firstName },
      });

      expect(response.statusCode).toBe(422);
      expect(signUp).not.toHaveBeenCalled();
    });

    it('accepts a valid firstName', async () => {
      const signUp = vi.fn<RegisterGateway['signUp']>().mockResolvedValue({
        user: { id: '11111111-1111-4111-8111-111111111111', email: 'student@example.com' },
        accessToken: null,
        refreshToken: null,
      });
      app = await buildAppWithSignUp(signUp);

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { ...validPayload, firstName: 'a'.repeat(50) },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('lastName validation', () => {
    it.each([
      ['empty string', ''],
      ['whitespace only', '   '],
      ['too long', 'a'.repeat(51)],
    ])('returns 422 for %s without calling Supabase', async (_label, lastName) => {
      const signUp = vi.fn<RegisterGateway['signUp']>();
      app = await buildAppWithSignUp(signUp);

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { ...validPayload, lastName },
      });

      expect(response.statusCode).toBe(422);
      expect(signUp).not.toHaveBeenCalled();
    });

    it('accepts a valid lastName', async () => {
      const signUp = vi.fn<RegisterGateway['signUp']>().mockResolvedValue({
        user: { id: '11111111-1111-4111-8111-111111111111', email: 'student@example.com' },
        accessToken: null,
        refreshToken: null,
      });
      app = await buildAppWithSignUp(signUp);

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { ...validPayload, lastName: 'a'.repeat(50) },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('email validation', () => {
    it.each([
      'not-an-email',
      'missing-domain@',
      '@missing-local.com',
      'no-at-sign.com',
    ])('returns 422 for malformed email %s without calling Supabase', async (email) => {
      const signUp = vi.fn<RegisterGateway['signUp']>();
      app = await buildAppWithSignUp(signUp);

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { ...validPayload, email },
      });

      expect(response.statusCode).toBe(422);
      expect(signUp).not.toHaveBeenCalled();
    });

    it.each([
      'person@example.com',
      'person@sub.example.co.uk',
      'person@some-other-domain.org',
    ])('accepts a syntactically valid email at any domain: %s', async (email) => {
      const signUp = vi.fn<RegisterGateway['signUp']>().mockResolvedValue({
        user: { id: '11111111-1111-4111-8111-111111111111', email },
        accessToken: null,
        refreshToken: null,
      });
      app = await buildAppWithSignUp(signUp);

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { ...validPayload, email },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('password validation', () => {
    it.each([
      ['too short', 'Pw1!'],
      ['no digit', 'Password!'],
      ['no special character', 'Password1'],
    ])('returns 422 for %s without calling Supabase', async (_label, password) => {
      const signUp = vi.fn<RegisterGateway['signUp']>();
      app = await buildAppWithSignUp(signUp);

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { ...validPayload, password },
      });

      expect(response.statusCode).toBe(422);
      expect(signUp).not.toHaveBeenCalled();
    });

    it('returns 422 for an oversized password without calling Supabase', async () => {
      const signUp = vi.fn<RegisterGateway['signUp']>();
      app = await buildAppWithSignUp(signUp);

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { ...validPayload, password: `Aa1!${'a'.repeat(126)}` },
      });

      expect(response.statusCode).toBe(422);
      expect(signUp).not.toHaveBeenCalled();
    });

    it('accepts a valid password', async () => {
      const signUp = vi.fn<RegisterGateway['signUp']>().mockResolvedValue({
        user: { id: '11111111-1111-4111-8111-111111111111', email: 'student@example.com' },
        accessToken: null,
        refreshToken: null,
      });
      app = await buildAppWithSignUp(signUp);

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { ...validPayload, password: 'Password1!' },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
