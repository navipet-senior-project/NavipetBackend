import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createSupabaseResources,
  type PasswordResetRequestGateway,
  type UserEmailLookupGateway,
} from '../../src/plugins/supabase.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

const anyString = expect.any(String) as unknown;
const successMessage = 'Verification code sent. Check your inbox.';
const knownUserId = '11111111-1111-4111-8111-111111111111';

function buildApp(overrides: {
  findUserIdByEmail?: ReturnType<
    typeof vi.fn<UserEmailLookupGateway['findUserIdByEmail']>
  >;
  requestPasswordReset?: ReturnType<
    typeof vi.fn<PasswordResetRequestGateway['requestPasswordReset']>
  >;
}) {
  const supabaseResources = {
    ...createSupabaseResources(TEST_ENV),
    findUserIdByEmail:
      overrides.findUserIdByEmail ??
      vi.fn<UserEmailLookupGateway['findUserIdByEmail']>().mockResolvedValue(knownUserId),
    requestPasswordReset:
      overrides.requestPasswordReset ??
      vi.fn<PasswordResetRequestGateway['requestPasswordReset']>().mockResolvedValue(undefined),
  };
  return buildTestApp({}, { supabaseResources });
}

describe('forgot password', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('returns 200 and sends the code when the account exists', async () => {
    const requestPasswordReset = vi
      .fn<PasswordResetRequestGateway['requestPasswordReset']>()
      .mockResolvedValue(undefined);
    app = await buildApp({ requestPasswordReset });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: 'student@example.com' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: successMessage });
    expect(requestPasswordReset).toHaveBeenCalledWith('student@example.com');
  });

  it('returns 404 USER_NOT_FOUND without sending a code when the account does not exist', async () => {
    const findUserIdByEmail = vi
      .fn<UserEmailLookupGateway['findUserIdByEmail']>()
      .mockResolvedValue(null);
    const requestPasswordReset = vi.fn<
      PasswordResetRequestGateway['requestPasswordReset']
    >();
    app = await buildApp({ findUserIdByEmail, requestPasswordReset });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: 'nobody@example.com' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: 'USER_NOT_FOUND', message: anyString, requestId: anyString },
    });
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it('normalizes email by trimming and lowercasing before the lookup', async () => {
    const findUserIdByEmail = vi
      .fn<UserEmailLookupGateway['findUserIdByEmail']>()
      .mockResolvedValue(knownUserId);
    app = await buildApp({ findUserIdByEmail });

    await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: '  Student@Example.com  ' },
    });

    expect(findUserIdByEmail).toHaveBeenCalledWith('student@example.com');
  });

  it('returns 503 when Supabase admin credentials are not configured', async () => {
    app = await buildTestApp({}, {});

    const response = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: 'student@example.com' },
    });

    expect(response.statusCode).toBe(503);
  });

  it.each(['over_email_send_rate_limit', 'over_request_rate_limit'])(
    'returns 429 RATE_LIMITED when Supabase reports %s',
    async (code) => {
      const requestPasswordReset = vi
        .fn<PasswordResetRequestGateway['requestPasswordReset']>()
        .mockRejectedValue({ code, message: 'rate limited' });
      app = await buildApp({ requestPasswordReset });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/forgot-password',
        payload: { email: 'student@example.com' },
      });

      expect(response.statusCode).toBe(429);
      expect(response.json()).toEqual({
        error: { code: 'RATE_LIMITED', message: anyString, requestId: anyString },
      });
    },
  );

  it('returns 502 UPSTREAM_ERROR for an unexpected failure sending the code', async () => {
    const requestPasswordReset = vi
      .fn<PasswordResetRequestGateway['requestPasswordReset']>()
      .mockRejectedValue(new Error('connection refused'));
    app = await buildApp({ requestPasswordReset });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: 'student@example.com' },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: anyString, requestId: anyString },
    });
    expect(response.body).not.toContain('connection refused');
  });

  it('returns 502 UPSTREAM_ERROR for an unexpected failure during lookup', async () => {
    const findUserIdByEmail = vi
      .fn<UserEmailLookupGateway['findUserIdByEmail']>()
      .mockRejectedValue(new Error('connection refused'));
    app = await buildApp({ findUserIdByEmail });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: 'student@example.com' },
    });

    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain('connection refused');
  });

  it('returns 400 INVALID_JSON for malformed JSON', async () => {
    const findUserIdByEmail = vi.fn<UserEmailLookupGateway['findUserIdByEmail']>();
    app = await buildApp({ findUserIdByEmail });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      headers: { 'content-type': 'application/json' },
      payload: '{"email":',
    });

    expect(response.statusCode).toBe(400);
    expect(findUserIdByEmail).not.toHaveBeenCalled();
  });

  describe('email validation', () => {
    it.each(['not-an-email', 'missing-domain@', '@missing-local.com'])(
      'returns 422 for malformed email %s without calling Supabase',
      async (email) => {
        const findUserIdByEmail = vi.fn<UserEmailLookupGateway['findUserIdByEmail']>();
        app = await buildApp({ findUserIdByEmail });

        const response = await app.inject({
          method: 'POST',
          url: '/auth/forgot-password',
          payload: { email },
        });

        expect(response.statusCode).toBe(422);
        expect(findUserIdByEmail).not.toHaveBeenCalled();
      },
    );
  });
});
