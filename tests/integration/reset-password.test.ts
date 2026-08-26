import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JwtVerifier } from '../../src/plugins/auth.js';
import {
  createSupabaseResources,
  type PasswordUpdateGateway,
} from '../../src/plugins/supabase.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

const anyString = expect.any(String) as unknown;
const verifiedUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'student@example.com',
};
const validPayload = { newPassword: 'Password1', confirmPassword: 'Password1' };

function verifiedVerifier(): JwtVerifier {
  return { verify: vi.fn().mockResolvedValue(verifiedUser) };
}

function buildAppWithUpdatePassword(
  updatePassword: ReturnType<typeof vi.fn<PasswordUpdateGateway['updatePassword']>>,
) {
  const supabaseResources = { ...createSupabaseResources(TEST_ENV), updatePassword };
  return buildTestApp(
    {},
    { supabaseResources, authVerifier: verifiedVerifier() },
  );
}

describe('reset password', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('returns 204 with an empty body on success', async () => {
    const updatePassword = vi
      .fn<PasswordUpdateGateway['updatePassword']>()
      .mockResolvedValue(undefined);
    app = await buildAppWithUpdatePassword(updatePassword);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      headers: { authorization: 'Bearer recovery-access-token' },
      payload: validPayload,
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(updatePassword).toHaveBeenCalledWith(verifiedUser.id, 'Password1');
  });

  it('returns 401 INVALID_ACCESS_TOKEN without a bearer token', async () => {
    const updatePassword = vi.fn<PasswordUpdateGateway['updatePassword']>();
    app = await buildAppWithUpdatePassword(updatePassword);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: validPayload,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: 'INVALID_ACCESS_TOKEN', message: anyString, requestId: anyString },
    });
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it('returns 422 when newPassword and confirmPassword do not match', async () => {
    const updatePassword = vi.fn<PasswordUpdateGateway['updatePassword']>();
    app = await buildAppWithUpdatePassword(updatePassword);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      headers: { authorization: 'Bearer recovery-access-token' },
      payload: { newPassword: 'Password1', confirmPassword: 'Password2' },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: anyString, requestId: anyString },
    });
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it('returns 422 when Supabase reports the password matches the previous one', async () => {
    const updatePassword = vi
      .fn<PasswordUpdateGateway['updatePassword']>()
      .mockRejectedValue({ code: 'same_password', message: 'same password' });
    app = await buildAppWithUpdatePassword(updatePassword);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      headers: { authorization: 'Bearer recovery-access-token' },
      payload: validPayload,
    });

    expect(response.statusCode).toBe(422);
  });

  it('returns 422 when Supabase reports weak_password', async () => {
    const updatePassword = vi
      .fn<PasswordUpdateGateway['updatePassword']>()
      .mockRejectedValue({ code: 'weak_password', message: 'weak' });
    app = await buildAppWithUpdatePassword(updatePassword);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      headers: { authorization: 'Bearer recovery-access-token' },
      payload: validPayload,
    });

    expect(response.statusCode).toBe(422);
  });

  it('returns 503 when Supabase admin credentials are not configured', async () => {
    app = await buildTestApp(
      {},
      { authVerifier: verifiedVerifier() },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      headers: { authorization: 'Bearer recovery-access-token' },
      payload: validPayload,
    });

    expect(response.statusCode).toBe(503);
  });

  it('returns 500 INTERNAL_ERROR for an unexpected Supabase failure', async () => {
    const updatePassword = vi
      .fn<PasswordUpdateGateway['updatePassword']>()
      .mockRejectedValue(new Error('connection refused'));
    app = await buildAppWithUpdatePassword(updatePassword);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      headers: { authorization: 'Bearer recovery-access-token' },
      payload: validPayload,
    });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('connection refused');
  });

  describe('password validation', () => {
    it.each([
      ['too short', 'Pw1'],
      ['no uppercase', 'password1'],
      ['no digit', 'Password'],
    ])('returns 422 for %s without calling Supabase', async (_label, password) => {
      const updatePassword = vi.fn<PasswordUpdateGateway['updatePassword']>();
      app = await buildAppWithUpdatePassword(updatePassword);

      const response = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        headers: { authorization: 'Bearer recovery-access-token' },
        payload: { newPassword: password, confirmPassword: password },
      });

      expect(response.statusCode).toBe(422);
      expect(updatePassword).not.toHaveBeenCalled();
    });
  });
});
