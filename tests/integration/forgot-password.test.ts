import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createSupabaseResources,
  type PasswordResetRequestGateway,
} from '../../src/plugins/supabase.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

const anyString = expect.any(String) as unknown;
const successMessage =
  'If an account exists for this email, a verification code has been sent.';

function buildAppWithRequestPasswordReset(
  requestPasswordReset: ReturnType<
    typeof vi.fn<PasswordResetRequestGateway['requestPasswordReset']>
  >,
) {
  const supabaseResources = {
    ...createSupabaseResources(TEST_ENV),
    requestPasswordReset,
  };
  return buildTestApp({}, { supabaseResources });
}

describe('forgot password', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('returns 200 with the same message whether or not the account exists', async () => {
    const requestPasswordReset = vi
      .fn<PasswordResetRequestGateway['requestPasswordReset']>()
      .mockResolvedValue(undefined);
    app = await buildAppWithRequestPasswordReset(requestPasswordReset);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: 'student@example.com' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: successMessage });
  });

  it('normalizes email by trimming and lowercasing before calling Supabase', async () => {
    const requestPasswordReset = vi
      .fn<PasswordResetRequestGateway['requestPasswordReset']>()
      .mockResolvedValue(undefined);
    app = await buildAppWithRequestPasswordReset(requestPasswordReset);

    await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: '  Student@Example.com  ' },
    });

    expect(requestPasswordReset).toHaveBeenCalledWith('student@example.com');
  });

  it.each(['over_email_send_rate_limit', 'over_request_rate_limit'])(
    'returns 429 RATE_LIMITED when Supabase reports %s',
    async (code) => {
      const requestPasswordReset = vi
        .fn<PasswordResetRequestGateway['requestPasswordReset']>()
        .mockRejectedValue({ code, message: 'rate limited' });
      app = await buildAppWithRequestPasswordReset(requestPasswordReset);

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

  it('returns 502 UPSTREAM_ERROR for an unexpected Supabase failure', async () => {
    const requestPasswordReset = vi
      .fn<PasswordResetRequestGateway['requestPasswordReset']>()
      .mockRejectedValue(new Error('connection refused'));
    app = await buildAppWithRequestPasswordReset(requestPasswordReset);

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

  it('returns 400 INVALID_JSON for malformed JSON', async () => {
    const requestPasswordReset = vi.fn<
      PasswordResetRequestGateway['requestPasswordReset']
    >();
    app = await buildAppWithRequestPasswordReset(requestPasswordReset);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      headers: { 'content-type': 'application/json' },
      payload: '{"email":',
    });

    expect(response.statusCode).toBe(400);
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  describe('email validation', () => {
    it.each(['not-an-email', 'missing-domain@', '@missing-local.com'])(
      'returns 422 for malformed email %s without calling Supabase',
      async (email) => {
        const requestPasswordReset = vi.fn<
          PasswordResetRequestGateway['requestPasswordReset']
        >();
        app = await buildAppWithRequestPasswordReset(requestPasswordReset);

        const response = await app.inject({
          method: 'POST',
          url: '/auth/forgot-password',
          payload: { email },
        });

        expect(response.statusCode).toBe(422);
        expect(requestPasswordReset).not.toHaveBeenCalled();
      },
    );
  });
});
