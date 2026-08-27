import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../../src/common/errors/app-error.js';
import { createSupabaseResources } from '../../src/plugins/supabase.js';
import { TEST_ENV } from '../helpers/build-test-app.js';

const baseUser = {
  id: '11111111-1111-4111-8111-111111111111',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'student@example.com',
  phone: '',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [],
  created_at: '2026-08-24T00:00:00.000Z',
  updated_at: '2026-08-24T00:00:00.000Z',
  is_anonymous: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('signUp gateway', () => {
  it('returns tokens when Supabase issues a session immediately', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        access_token: 'signed-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: 2_000_000_000,
        refresh_token: 'rotating-refresh-token',
        user: baseUser,
      }),
    );
    const resources = createSupabaseResources(TEST_ENV);

    await expect(
      resources.signUp({
        email: 'student@example.com',
        password: 'a-long-user-password',
        firstName: 'Elbee',
        lastName: 'Shark',
      }),
    ).resolves.toEqual({
      user: { id: baseUser.id, email: baseUser.email },
      accessToken: 'signed-access-token',
      refreshToken: 'rotating-refresh-token',
    });
  });

  it('returns null tokens when email confirmation is pending', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse(baseUser));
    const resources = createSupabaseResources(TEST_ENV);

    await expect(
      resources.signUp({
        email: 'student@example.com',
        password: 'a-long-user-password',
        firstName: 'Elbee',
        lastName: 'Shark',
      }),
    ).resolves.toEqual({
      user: { id: baseUser.id, email: baseUser.email },
      accessToken: null,
      refreshToken: null,
    });
  });

  it('throws the Supabase error code when the email is already registered', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(
        { error_code: 'email_exists', msg: 'User already registered' },
        422,
      ),
    );
    const resources = createSupabaseResources(TEST_ENV);

    await expect(
      resources.signUp({
        email: 'student@example.com',
        password: 'a-long-user-password',
        firstName: 'Elbee',
        lastName: 'Shark',
      }),
    ).rejects.toMatchObject({ code: 'email_exists' });
  });

  it('forwards first_name, last_name, and display_name metadata to Supabase', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(baseUser),
    );
    const resources = createSupabaseResources(TEST_ENV);

    await resources.signUp({
      email: 'student@example.com',
      password: 'a-long-user-password',
      firstName: 'Elbee',
      lastName: 'Shark',
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      data: { first_name: string; last_name: string; display_name: string };
    };
    expect(body.data).toEqual({
      first_name: 'Elbee',
      last_name: 'Shark',
      display_name: 'Elbee Shark',
    });
  });
});

describe('refreshSession gateway', () => {
  it('returns a rotated token pair on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        access_token: 'new-access-token',
        token_type: 'bearer',
        expires_in: 900,
        expires_at: 2_000_000_000,
        refresh_token: 'new-refresh-token',
        user: baseUser,
      }),
    );
    const resources = createSupabaseResources(TEST_ENV);

    await expect(resources.refreshSession('old-refresh-token')).resolves.toEqual({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      userId: baseUser.id,
    });
  });

  it('throws refresh_token_already_used on reuse', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(
        { error_code: 'refresh_token_already_used', msg: 'Already used' },
        401,
      ),
    );
    const resources = createSupabaseResources(TEST_ENV);

    await expect(resources.refreshSession('consumed-token')).rejects.toMatchObject({
      code: 'refresh_token_already_used',
    });
  });
});

describe('adminSignOut gateway', () => {
  it('throws a 503 AppError when no service role key is configured', async () => {
    const resources = createSupabaseResources(TEST_ENV);

    await expect(
      resources.adminSignOut('some-access-token', 'local'),
    ).rejects.toMatchObject({
      statusCode: 503,
    });
    await expect(
      resources.adminSignOut('some-access-token', 'local'),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('calls the admin signOut endpoint with the given scope', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const resources = createSupabaseResources({
      ...TEST_ENV,
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    });

    await resources.adminSignOut('user-access-token', 'global');

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/logout');
    expect(url).toContain('scope=global');
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer user-access-token',
    );
  });
});

describe('findUserIdByEmail gateway', () => {
  it('throws a 503 AppError when no service role key is configured', async () => {
    const resources = createSupabaseResources(TEST_ENV);

    await expect(
      resources.findUserIdByEmail('student@example.com'),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it('returns the matching user id on the first page', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ users: [baseUser], aud: 'authenticated' }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-total-count': '1' },
      }),
    );
    const resources = createSupabaseResources({
      ...TEST_ENV,
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    });

    await expect(resources.findUserIdByEmail('STUDENT@example.com')).resolves.toBe(
      baseUser.id,
    );
  });

  it('paginates when the account is not on the first page', async () => {
    const otherUser = { ...baseUser, id: '22222222-2222-4222-8222-222222222222', email: 'other@example.com' };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ users: Array(1000).fill(otherUser), aud: 'authenticated' }),
          {
            status: 200,
            headers: { 'content-type': 'application/json', 'x-total-count': '1001' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ users: [baseUser], aud: 'authenticated' }), {
          status: 200,
          headers: { 'content-type': 'application/json', 'x-total-count': '1001' },
        }),
      );
    const resources = createSupabaseResources({
      ...TEST_ENV,
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    });

    await expect(resources.findUserIdByEmail('student@example.com')).resolves.toBe(
      baseUser.id,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns null once every page has been scanned without a match', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ users: [], aud: 'authenticated' }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-total-count': '0' },
      }),
    );
    const resources = createSupabaseResources({
      ...TEST_ENV,
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    });

    await expect(
      resources.findUserIdByEmail('nobody@example.com'),
    ).resolves.toBeNull();
  });
});

describe('requestPasswordReset gateway', () => {
  it('calls the recovery endpoint with the given email', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({}));
    const resources = createSupabaseResources(TEST_ENV);

    await resources.requestPasswordReset('student@example.com');

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/recover');
    const body = JSON.parse(init.body as string) as { email: string };
    expect(body.email).toBe('student@example.com');
  });

  it('throws the Supabase error code when rate limited', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(
        { error_code: 'over_email_send_rate_limit', msg: 'Too many requests' },
        429,
      ),
    );
    const resources = createSupabaseResources(TEST_ENV);

    await expect(
      resources.requestPasswordReset('student@example.com'),
    ).rejects.toMatchObject({ code: 'over_email_send_rate_limit' });
  });
});

describe('verifyOtp gateway', () => {
  it('returns recovery tokens on a correct recovery code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        access_token: 'recovery-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: 2_000_000_000,
        refresh_token: 'recovery-refresh-token',
        user: baseUser,
      }),
    );
    const resources = createSupabaseResources(TEST_ENV);

    await expect(
      resources.verifyOtp('student@example.com', '123456', 'recovery'),
    ).resolves.toEqual({
      type: 'recovery',
      tokens: {
        accessToken: 'recovery-access-token',
        refreshToken: 'recovery-refresh-token',
      },
    });
  });

  it('returns a register confirmation on a correct register code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        access_token: 'register-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: 2_000_000_000,
        refresh_token: 'register-refresh-token',
        user: baseUser,
      }),
    );
    const resources = createSupabaseResources(TEST_ENV);

    await expect(
      resources.verifyOtp('student@example.com', '123456', 'register'),
    ).resolves.toEqual({ type: 'register' });
  });

  it('returns null when Supabase reports an expired or incorrect code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ error_code: 'otp_expired', msg: 'Token has expired or is invalid' }, 403),
    );
    const resources = createSupabaseResources(TEST_ENV);

    await expect(
      resources.verifyOtp('student@example.com', '000000', 'recovery'),
    ).resolves.toBeNull();
  });

  it('throws for an unexpected Supabase error code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ error_code: 'over_request_rate_limit', msg: 'Too many requests' }, 429),
    );
    const resources = createSupabaseResources(TEST_ENV);

    await expect(
      resources.verifyOtp('student@example.com', '123456', 'recovery'),
    ).rejects.toMatchObject({ code: 'over_request_rate_limit' });
  });
});

describe('updatePassword gateway', () => {
  it('throws a 503 AppError when no service role key is configured', async () => {
    const resources = createSupabaseResources(TEST_ENV);

    await expect(
      resources.updatePassword(baseUser.id, 'Password1'),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it('sends the new password via the admin API', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ user: baseUser }));
    const resources = createSupabaseResources({
      ...TEST_ENV,
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    });

    await resources.updatePassword(baseUser.id, 'Password1');

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/admin/users/${baseUser.id}`);
    const body = JSON.parse(init.body as string) as { password: string };
    expect(body.password).toBe('Password1');
  });

  it('throws the Supabase error code when the password matches the previous one', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ error_code: 'same_password', msg: 'New password should be different' }, 422),
    );
    const resources = createSupabaseResources({
      ...TEST_ENV,
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    });

    await expect(
      resources.updatePassword(baseUser.id, 'Password1'),
    ).rejects.toMatchObject({ code: 'same_password' });
  });
});

describe('getUserById gateway', () => {
  it('returns ACTIVE status for a user with no ban', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ user: baseUser }),
    );
    const resources = createSupabaseResources({
      ...TEST_ENV,
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    });

    await expect(resources.getUserById(baseUser.id)).resolves.toEqual({
      id: baseUser.id,
      email: baseUser.email,
      status: 'ACTIVE',
      createdAt: baseUser.created_at,
    });
  });

  it('returns DISABLED status for a banned user', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        user: { ...baseUser, banned_until: '2099-01-01T00:00:00.000Z' },
      }),
    );
    const resources = createSupabaseResources({
      ...TEST_ENV,
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    });

    await expect(resources.getUserById(baseUser.id)).resolves.toMatchObject({
      status: 'DISABLED',
    });
  });

  it('returns null when the user no longer exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ error_code: 'user_not_found', msg: 'User not found' }, 404),
    );
    const resources = createSupabaseResources({
      ...TEST_ENV,
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    });

    await expect(resources.getUserById(baseUser.id)).resolves.toBeNull();
  });
});
