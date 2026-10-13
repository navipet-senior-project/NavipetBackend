import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createSupabaseResources,
  type OtpVerificationGateway,
} from '../../src/plugins/supabase.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

const RESEND_URL = 'https://api.resend.com/emails';
const tokens = { accessToken: 'changed-access-token', refreshToken: 'changed-refresh-token' };

function stubFetch(implementation: typeof fetch) {
  const fetchMock = vi.fn<typeof fetch>(implementation);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function buildApp(envOverrides: Record<string, string>) {
  const supabaseResources = {
    ...createSupabaseResources(TEST_ENV),
    verifyOtp: vi.fn<OtpVerificationGateway['verifyOtp']>().mockResolvedValue({ tokens }),
  };
  return buildTestApp(envOverrides, { supabaseResources });
}

function verify(app: FastifyInstance, type: string, email = 'new-email@example.com') {
  return app.inject({
    method: 'POST',
    url: '/auth/verify-otp',
    payload: { email, code: '123456', type },
  });
}

describe('email-change receipt', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    vi.unstubAllGlobals();
  });

  it('sends one receipt to the normalized new email after an email change', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response('{"id":"email-id"}')));
    app = await buildApp({ RESEND_API_KEY: 'test-resend-key' });

    const response = await verify(app, 'email_change', 'New-Email@Example.COM');

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(RESEND_URL);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-resend-key');
    const payload = JSON.parse(init?.body as string) as { text: string; html: string };
    expect(payload).toMatchObject({
      from: 'NaviPet <noreply@navipet.me>',
      to: ['new-email@example.com'],
      subject: 'Your NaviPet email address was changed',
    });
    expect(payload.text).not.toContain('did not make this change');
    expect(payload.html).not.toContain('did not make this change');
  });

  it('does not hold the new session while the receipt is still in flight', async () => {
    const fetchMock = stubFetch(() => new Promise<Response>(() => undefined));
    app = await buildApp({ RESEND_API_KEY: 'test-resend-key' });

    const response = await verify(app, 'email_change');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      access_token: 'changed-access-token',
      refresh_token: 'changed-refresh-token',
      message: 'Email updated. Use this email the next time you sign in.',
    });
  });

  it('still returns the new session when Resend rejects the receipt', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(new Response('{"message":"invalid key"}', { status: 401 })),
    );
    app = await buildApp({ RESEND_API_KEY: 'test-resend-key' });

    const response = await verify(app, 'email_change');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      access_token: 'changed-access-token',
      refresh_token: 'changed-refresh-token',
      message: 'Email updated. Use this email the next time you sign in.',
    });
  });

  it('still returns the new session when Resend is unreachable', async () => {
    stubFetch(() => Promise.reject(new TypeError('fetch failed')));
    app = await buildApp({ RESEND_API_KEY: 'test-resend-key' });

    const response = await verify(app, 'email_change');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ access_token: 'changed-access-token' });
    expect(response.body).not.toContain('test-resend-key');
  });

  it('sends nothing and still succeeds when no Resend key is configured', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response('{}')));
    app = await buildApp({});

    const response = await verify(app, 'email_change');

    expect(response.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['register', 'recovery'])('never sends a receipt for type %s', async (type) => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response('{}')));
    app = await buildApp({ RESEND_API_KEY: 'test-resend-key' });

    const response = await verify(app, type);

    expect(response.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends nothing when the code is wrong', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response('{}')));
    const supabaseResources = {
      ...createSupabaseResources(TEST_ENV),
      verifyOtp: vi.fn<OtpVerificationGateway['verifyOtp']>().mockResolvedValue(null),
    };
    app = await buildTestApp({ RESEND_API_KEY: 'test-resend-key' }, { supabaseResources });

    const response = await verify(app, 'email_change');

    expect(response.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
