import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser, JwtVerifier } from '../../src/plugins/auth.js';
import {
  createSupabaseResources,
  type EmailChangeGateway,
} from '../../src/plugins/supabase.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

type RequestEmailChange = ReturnType<typeof vi.fn<EmailChangeGateway['requestEmailChange']>>;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function verifiedUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'student@example.com',
    sessionPurpose: 'standard',
    passwordAuthenticatedAt: nowSeconds() - 30,
    ...overrides,
  };
}

function supabaseError(code: string): Error {
  return Object.assign(new Error(`supabase ${code}`), { code });
}

describe('change email', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => app?.close());

  function buildApp(
    requestEmailChange: RequestEmailChange,
    user: AuthenticatedUser = verifiedUser(),
    envOverrides: Parameters<typeof buildTestApp>[0] = {},
  ) {
    return buildTestApp(envOverrides, {
      supabaseResources: { ...createSupabaseResources(TEST_ENV), requestEmailChange },
      authVerifier: { verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue(user) },
    });
  }

  function changeEmail(target: FastifyInstance, email: string) {
    return target.inject({
      method: 'POST',
      url: '/auth/change-email',
      headers: { authorization: 'Bearer current-access-token' },
      payload: { email },
    });
  }

  it('starts the Supabase email-change flow with a normalized email', async () => {
    const requestEmailChange: RequestEmailChange = vi.fn().mockResolvedValue(undefined);
    app = await buildApp(requestEmailChange);

    const response = await changeEmail(app, '  New-Email@Example.com ');

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ status: 'verification_required' });
    expect(requestEmailChange).toHaveBeenCalledWith(
      'current-access-token', 'new-email@example.com',
    );
  });

  it('requires a bearer token', async () => {
    const requestEmailChange: RequestEmailChange = vi.fn();
    app = await buildTestApp({}, {
      supabaseResources: { ...createSupabaseResources(TEST_ENV), requestEmailChange },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/change-email',
      payload: { email: 'new-email@example.com' },
    });

    expect(response.statusCode).toBe(401);
    expect(requestEmailChange).not.toHaveBeenCalled();
  });

  it('rejects a recovery-session token', async () => {
    const requestEmailChange: RequestEmailChange = vi.fn();
    app = await buildApp(requestEmailChange, verifiedUser({ sessionPurpose: 'recovery' }));

    const response = await changeEmail(app, 'new-email@example.com');

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_ACCESS_TOKEN' } });
    expect(requestEmailChange).not.toHaveBeenCalled();
  });

  it('requires reauthentication when the password sign-in is too old', async () => {
    const requestEmailChange: RequestEmailChange = vi.fn();
    app = await buildApp(
      requestEmailChange,
      verifiedUser({ passwordAuthenticatedAt: nowSeconds() - 3600 }),
    );

    const response = await changeEmail(app, 'new-email@example.com');

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'REAUTH_REQUIRED' } });
    expect(requestEmailChange).not.toHaveBeenCalled();
  });

  it('requires reauthentication when the session never used a password', async () => {
    const requestEmailChange: RequestEmailChange = vi.fn();
    app = await buildApp(requestEmailChange, {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'student@example.com',
      sessionPurpose: 'standard',
    });

    const response = await changeEmail(app, 'new-email@example.com');

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'REAUTH_REQUIRED' } });
    expect(requestEmailChange).not.toHaveBeenCalled();
  });

  it('rejects an invalid email before calling Supabase', async () => {
    const requestEmailChange: RequestEmailChange = vi.fn();
    app = await buildApp(requestEmailChange);

    const response = await changeEmail(app, 'not-an-email');

    expect(response.statusCode).toBe(422);
    expect(requestEmailChange).not.toHaveBeenCalled();
  });

  it('rejects the current email before calling Supabase', async () => {
    const requestEmailChange: RequestEmailChange = vi.fn();
    app = await buildApp(requestEmailChange);

    const response = await changeEmail(app, '  Student@Example.com ');

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'New email must be different from the current email.',
      },
    });
    expect(requestEmailChange).not.toHaveBeenCalled();
  });

  it('answers an already-registered email exactly like a fresh one', async () => {
    const taken: RequestEmailChange = vi.fn().mockRejectedValue(supabaseError('email_exists'));
    app = await buildApp(taken);
    const takenResponse = await changeEmail(app, 'taken@example.com');
    await app.close();

    const fresh: RequestEmailChange = vi.fn().mockResolvedValue(undefined);
    app = await buildApp(fresh);
    const freshResponse = await changeEmail(app, 'fresh@example.com');

    expect(takenResponse.statusCode).toBe(202);
    expect(takenResponse.body).toBe(freshResponse.body);
  });

  it('maps a Supabase email rate limit to 429', async () => {
    const requestEmailChange: RequestEmailChange = vi
      .fn()
      .mockRejectedValue(supabaseError('over_email_send_rate_limit'));
    app = await buildApp(requestEmailChange);

    const response = await changeEmail(app, 'new-email@example.com');

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
  });

  it('maps an address Supabase refuses to 422', async () => {
    const requestEmailChange: RequestEmailChange = vi
      .fn()
      .mockRejectedValue(supabaseError('email_address_invalid'));
    app = await buildApp(requestEmailChange);

    const response = await changeEmail(app, 'new-email@example.com');

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('maps a session Supabase no longer knows to 401', async () => {
    const requestEmailChange: RequestEmailChange = vi
      .fn()
      .mockRejectedValue(supabaseError('session_not_found'));
    app = await buildApp(requestEmailChange);

    const response = await changeEmail(app, 'new-email@example.com');

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_ACCESS_TOKEN' } });
  });

  it('maps an unexpected Supabase failure to 502 without leaking detail', async () => {
    const requestEmailChange: RequestEmailChange = vi
      .fn()
      .mockRejectedValue(new Error('connection refused'));
    app = await buildApp(requestEmailChange);

    const response = await changeEmail(app, 'new-email@example.com');

    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain('connection refused');
  });

  it('applies the route rate limit', async () => {
    const requestEmailChange: RequestEmailChange = vi.fn().mockResolvedValue(undefined);
    app = await buildApp(requestEmailChange, verifiedUser(), {
      AUTH_CHANGE_EMAIL_RATE_LIMIT_MAX: 1,
    });

    const first = await changeEmail(app, 'new-email@example.com');
    const second = await changeEmail(app, 'new-email@example.com');

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(429);
    expect(requestEmailChange).toHaveBeenCalledTimes(1);
  });
});
