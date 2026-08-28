import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createSupabaseResources,
  type OtpVerificationGateway,
} from '../../src/plugins/supabase.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

const anyString = expect.any(String) as unknown;
const recoveryPayload = { email: 'student@example.com', code: '123456', type: 'recovery' };
const registerPayload = { email: 'student@example.com', code: '123456', type: 'register' };

function buildAppWithVerifyOtp(
  verifyOtp: ReturnType<typeof vi.fn<OtpVerificationGateway['verifyOtp']>>,
) {
  const supabaseResources = {
    ...createSupabaseResources(TEST_ENV),
    verifyOtp,
  };
  return buildTestApp({}, { supabaseResources });
}

describe('verify otp', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('returns a recovery session for a correct recovery code', async () => {
    const verifyOtp = vi
      .fn<OtpVerificationGateway['verifyOtp']>()
      .mockResolvedValue({
        tokens: { accessToken: 'recovery-access-token', refreshToken: 'recovery-refresh-token' },
      });
    app = await buildAppWithVerifyOtp(verifyOtp);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: recoveryPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      access_token: 'recovery-access-token',
      refresh_token: 'recovery-refresh-token',
    });
    expect(verifyOtp).toHaveBeenCalledWith('student@example.com', '123456', 'recovery');
  });

  it('returns a login session for a correct register code', async () => {
    const verifyOtp = vi
      .fn<OtpVerificationGateway['verifyOtp']>()
      .mockResolvedValue({
        tokens: { accessToken: 'register-access-token', refreshToken: 'register-refresh-token' },
      });
    app = await buildAppWithVerifyOtp(verifyOtp);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: registerPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      access_token: 'register-access-token',
      refresh_token: 'register-refresh-token',
    });
    expect(verifyOtp).toHaveBeenCalledWith('student@example.com', '123456', 'register');
  });

  it('normalizes email by trimming and lowercasing before calling Supabase', async () => {
    const verifyOtp = vi
      .fn<OtpVerificationGateway['verifyOtp']>()
      .mockResolvedValue({
        tokens: { accessToken: 'a', refreshToken: 'b' },
      });
    app = await buildAppWithVerifyOtp(verifyOtp);

    await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: { ...recoveryPayload, email: '  Student@Example.com  ' },
    });

    expect(verifyOtp).toHaveBeenCalledWith('student@example.com', '123456', 'recovery');
  });

  it('returns 401 INVALID_OTP for an incorrect or expired code', async () => {
    const verifyOtp = vi.fn<OtpVerificationGateway['verifyOtp']>().mockResolvedValue(null);
    app = await buildAppWithVerifyOtp(verifyOtp);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: recoveryPayload,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: 'INVALID_OTP', message: anyString, requestId: anyString },
    });
  });

  it('returns 502 UPSTREAM_ERROR for an unexpected Supabase failure', async () => {
    const verifyOtp = vi
      .fn<OtpVerificationGateway['verifyOtp']>()
      .mockRejectedValue(new Error('connection refused'));
    app = await buildAppWithVerifyOtp(verifyOtp);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: recoveryPayload,
    });

    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain('connection refused');
  });

  it('returns 400 INVALID_JSON for malformed JSON', async () => {
    const verifyOtp = vi.fn<OtpVerificationGateway['verifyOtp']>();
    app = await buildAppWithVerifyOtp(verifyOtp);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      headers: { 'content-type': 'application/json' },
      payload: '{"email":',
    });

    expect(response.statusCode).toBe(400);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  describe('code validation', () => {
    it.each(['12345', '1234567', 'abcdef', ''])(
      'returns 422 for an invalid 6-digit code %s without calling Supabase',
      async (code) => {
        const verifyOtp = vi.fn<OtpVerificationGateway['verifyOtp']>();
        app = await buildAppWithVerifyOtp(verifyOtp);

        const response = await app.inject({
          method: 'POST',
          url: '/auth/verify-otp',
          payload: { ...recoveryPayload, code },
        });

        expect(response.statusCode).toBe(422);
        expect(verifyOtp).not.toHaveBeenCalled();
      },
    );
  });

  describe('email validation', () => {
    it('returns 422 for a malformed email without calling Supabase', async () => {
      const verifyOtp = vi.fn<OtpVerificationGateway['verifyOtp']>();
      app = await buildAppWithVerifyOtp(verifyOtp);

      const response = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: { ...recoveryPayload, email: 'not-an-email' },
      });

      expect(response.statusCode).toBe(422);
      expect(verifyOtp).not.toHaveBeenCalled();
    });
  });

  describe('type validation', () => {
    it('returns 422 for a type that is not recovery or register without calling Supabase', async () => {
      const verifyOtp = vi.fn<OtpVerificationGateway['verifyOtp']>();
      app = await buildAppWithVerifyOtp(verifyOtp);

      const response = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: { ...recoveryPayload, type: 'magiclink' },
      });

      expect(response.statusCode).toBe(422);
      expect(verifyOtp).not.toHaveBeenCalled();
    });

    it('returns 422 when type is missing without calling Supabase', async () => {
      const verifyOtp = vi.fn<OtpVerificationGateway['verifyOtp']>();
      app = await buildAppWithVerifyOtp(verifyOtp);

      const response = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: { email: recoveryPayload.email, code: recoveryPayload.code },
      });

      expect(response.statusCode).toBe(422);
      expect(verifyOtp).not.toHaveBeenCalled();
    });
  });
});
