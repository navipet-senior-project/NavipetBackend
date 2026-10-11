import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JwtVerifier } from '../../src/plugins/auth.js';
import {
  createSupabaseResources,
  type EmailChangeGateway,
} from '../../src/plugins/supabase.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

const verifiedUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'student@example.com',
  sessionPurpose: 'standard' as const,
};

describe('change email', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => app?.close());

  function buildApp(requestEmailChange: ReturnType<typeof vi.fn<EmailChangeGateway['requestEmailChange']>>) {
    return buildTestApp({}, {
      supabaseResources: { ...createSupabaseResources(TEST_ENV), requestEmailChange },
      authVerifier: { verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue(verifiedUser) },
    });
  }

  it('starts the authenticated Supabase email-change flow with a normalized email', async () => {
    const requestEmailChange = vi.fn<EmailChangeGateway['requestEmailChange']>().mockResolvedValue(undefined);
    app = await buildApp(requestEmailChange);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/change-email',
      headers: { authorization: 'Bearer current-access-token' },
      payload: { email: '  New-Email@Example.com ' },
    });

    expect(response.statusCode).toBe(204);
    expect(requestEmailChange).toHaveBeenCalledWith(
      'current-access-token', 'new-email@example.com',
    );
  });

  it('requires a standard-session bearer token', async () => {
    const requestEmailChange = vi.fn<EmailChangeGateway['requestEmailChange']>();
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

  it('rejects an invalid email before calling Supabase', async () => {
    const requestEmailChange = vi.fn<EmailChangeGateway['requestEmailChange']>();
    app = await buildApp(requestEmailChange);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/change-email',
      headers: { authorization: 'Bearer current-access-token' },
      payload: { email: 'not-an-email' },
    });

    expect(response.statusCode).toBe(422);
    expect(requestEmailChange).not.toHaveBeenCalled();
  });

  it('rejects the current email before calling Supabase', async () => {
    const requestEmailChange = vi.fn<EmailChangeGateway['requestEmailChange']>();
    app = await buildApp(requestEmailChange);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/change-email',
      headers: { authorization: 'Bearer current-access-token' },
      payload: { email: '  Student@Example.com ' },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR', message: 'New email must be different from the current email.' },
    });
    expect(requestEmailChange).not.toHaveBeenCalled();
  });

  it('maps Supabase email conflicts to a validation error', async () => {
    const error = new Error('already registered');
    Object.assign(error, { code: 'email_exists' });
    const requestEmailChange = vi
      .fn<EmailChangeGateway['requestEmailChange']>()
      .mockRejectedValue(error);
    app = await buildApp(requestEmailChange);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/change-email',
      headers: { authorization: 'Bearer current-access-token' },
      payload: { email: 'new-email@example.com' },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});
