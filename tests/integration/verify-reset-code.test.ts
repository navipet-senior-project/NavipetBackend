import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createSupabaseResources,
  type PasswordResetVerificationGateway,
} from '../../src/plugins/supabase.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

const anyString = expect.any(String) as unknown;
const validPayload = { email: 'student@example.com', code: '123456' };

function buildAppWithVerifyResetCode(
  verifyPasswordResetCode: ReturnType<
    typeof vi.fn<PasswordResetVerificationGateway['verifyPasswordResetCode']>
  >,
) {
  const supabaseResources = {
    ...createSupabaseResources(TEST_ENV),
    verifyPasswordResetCode,
  };
  return buildTestApp({}, { supabaseResources });
}

describe('verify reset code', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('returns a recovery session on a correct code', async () => {
    const verifyPasswordResetCode = vi
      .fn<PasswordResetVerificationGateway['verifyPasswordResetCode']>()
      .mockResolvedValue({
        accessToken: 'recovery-access-token',
        refreshToken: 'recovery-refresh-token',
      });
    app = await buildAppWithVerifyResetCode(verifyPasswordResetCode);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/verify-reset-code',
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      access_token: 'recovery-access-token',
      refresh_token: 'recovery-refresh-token',
    });
    expect(verifyPasswordResetCode).toHaveBeenCalledWith(
      'student@example.com',
      '123456',
    );
  });

  it('normalizes email by trimming and lowercasing before calling Supabase', async () => {
    const verifyPasswordResetCode = vi
      .fn<PasswordResetVerificationGateway['verifyPasswordResetCode']>()
      .mockResolvedValue({ accessToken: 'a', refreshToken: 'b' });
    app = await buildAppWithVerifyResetCode(verifyPasswordResetCode);

    await app.inject({
      method: 'POST',
      url: '/auth/verify-reset-code',
      payload: { ...validPayload, email: '  Student@Example.com  ' },
    });

    expect(verifyPasswordResetCode).toHaveBeenCalledWith(
      'student@example.com',
      '123456',
    );
  });

  it('returns 401 INVALID_RESET_CODE for an incorrect or expired code', async () => {
    const verifyPasswordResetCode = vi
      .fn<PasswordResetVerificationGateway['verifyPasswordResetCode']>()
      .mockResolvedValue(null);
    app = await buildAppWithVerifyResetCode(verifyPasswordResetCode);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/verify-reset-code',
      payload: validPayload,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: 'INVALID_RESET_CODE', message: anyString, requestId: anyString },
    });
  });

  it('returns 502 UPSTREAM_ERROR for an unexpected Supabase failure', async () => {
    const verifyPasswordResetCode = vi
      .fn<PasswordResetVerificationGateway['verifyPasswordResetCode']>()
      .mockRejectedValue(new Error('connection refused'));
    app = await buildAppWithVerifyResetCode(verifyPasswordResetCode);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/verify-reset-code',
      payload: validPayload,
    });

    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain('connection refused');
  });

  it('returns 400 INVALID_JSON for malformed JSON', async () => {
    const verifyPasswordResetCode = vi.fn<
      PasswordResetVerificationGateway['verifyPasswordResetCode']
    >();
    app = await buildAppWithVerifyResetCode(verifyPasswordResetCode);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/verify-reset-code',
      headers: { 'content-type': 'application/json' },
      payload: '{"email":',
    });

    expect(response.statusCode).toBe(400);
    expect(verifyPasswordResetCode).not.toHaveBeenCalled();
  });

  describe('code validation', () => {
    it.each(['12345', '1234567', 'abcdef', ''])(
      'returns 422 for an invalid 6-digit code %s without calling Supabase',
      async (code) => {
        const verifyPasswordResetCode = vi.fn<
          PasswordResetVerificationGateway['verifyPasswordResetCode']
        >();
        app = await buildAppWithVerifyResetCode(verifyPasswordResetCode);

        const response = await app.inject({
          method: 'POST',
          url: '/auth/verify-reset-code',
          payload: { ...validPayload, code },
        });

        expect(response.statusCode).toBe(422);
        expect(verifyPasswordResetCode).not.toHaveBeenCalled();
      },
    );
  });

  describe('email validation', () => {
    it('returns 422 for a malformed email without calling Supabase', async () => {
      const verifyPasswordResetCode = vi.fn<
        PasswordResetVerificationGateway['verifyPasswordResetCode']
      >();
      app = await buildAppWithVerifyResetCode(verifyPasswordResetCode);

      const response = await app.inject({
        method: 'POST',
        url: '/auth/verify-reset-code',
        payload: { ...validPayload, email: 'not-an-email' },
      });

      expect(response.statusCode).toBe(422);
      expect(verifyPasswordResetCode).not.toHaveBeenCalled();
    });
  });
});
