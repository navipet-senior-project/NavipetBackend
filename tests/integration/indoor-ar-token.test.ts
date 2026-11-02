import type { FastifyInstance } from 'fastify';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../helpers/build-test-app.js';
import { TEST_ENV } from '../helpers/build-test-app.js';
import { buildApp } from '../../src/app.js';
import { getLoggerOptions } from '../../src/config/logging.js';

const verifier = {
  verify: vi.fn((token: string) => Promise.resolve({ id: token, sessionPurpose: 'standard' as const })),
};
const credentials = { MULTISET_CLIENT_ID: 'test-client', MULTISET_CLIENT_SECRET: 'test-secret' };

describe('POST /indoor/ar-token', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => { await app?.close(); vi.restoreAllMocks(); });

  it('requires authentication before exchanging tokens', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected fetch'));
    app = await buildTestApp(credentials, { authVerifier: verifier });
    const response = await app.inject({ method: 'POST', url: '/indoor/ar-token' });
    expect(response.statusCode).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns only token and expiry with no-store and documents the contract', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
      token: 'short-lived-token', expiresOn: new Date(Date.now() + 1_800_000).toISOString(),
      error: null, clientId: 'never-return', clientSecret: 'never-return',
    }));
    app = await buildTestApp({ ...credentials, DOCS_ENABLED: true }, { authVerifier: verifier });
    const response = await app.inject({ method: 'POST', url: '/indoor/ar-token', headers: { authorization: 'Bearer student' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ token: 'short-lived-token', expiresOn: expect.any(String) as unknown });
    expect(response.headers['cache-control']).toBe('no-store');
    const document = app.swagger();
    expect(document.paths?.['/indoor/ar-token']?.post).toMatchObject({
      security: [{ bearerAuth: [] }], responses: { 200: {}, 401: {}, 429: {}, 502: {}, 503: {} },
    });
  });

  it('returns a stable clear 503 without configuration', async () => {
    app = await buildTestApp({}, { authVerifier: verifier });
    const response = await app.inject({ method: 'POST', url: '/indoor/ar-token', headers: { authorization: 'Bearer student' } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: {
      code: 'INDOOR_AR_UNAVAILABLE', message: 'Indoor AR token service is not configured', requestId: expect.any(String) as unknown,
    } });
  });

  it('keeps credentials and upstream error payloads out of development logs and responses', async () => {
    let output = '';
    const stream = new Writable({ write(chunk: Buffer, _encoding, done) { output += chunk.toString(); done(); } });
    const env = { ...TEST_ENV, ...credentials, NODE_ENV: 'development' as const, LOG_LEVEL: 'info' as const };
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('test-client:test-secret'));
    app = await buildApp({ env, authVerifier: verifier, logger: { ...getLoggerOptions(env), stream } });
    app.log.info(credentials, 'redaction probe');
    const response = await app.inject({ method: 'POST', url: '/indoor/ar-token', headers: { authorization: 'Bearer student' } });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
    expect(output).toContain('[REDACTED]');
    for (const value of ['test-client', 'test-secret', 'Basic dGVzdC1jbGllbnQ6dGVzdC1zZWNyZXQ=']) {
      expect(output).not.toContain(value);
      expect(response.body).not.toContain(value);
    }
  });

  it('limits by verified user across bearer tokens and isolates different users', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ token: 'shared-token', expiresOn: new Date(Date.now() + 1_800_000).toISOString(), error: null }));
    app = await buildTestApp(credentials, { authVerifier: {
      verify: (token) => Promise.resolve({ id: token === 'other' ? 'other-user' : 'same-user', sessionPurpose: 'standard' }),
    } });
    for (let index = 0; index < 5; index++) {
      const response = await app.inject({ method: 'POST', url: '/indoor/ar-token', headers: { authorization: `Bearer student-${String(index)}` } });
      expect(response.statusCode).toBe(200);
    }
    const limited = await app.inject({ method: 'POST', url: '/indoor/ar-token', headers: { authorization: 'Bearer rotated-token' } });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    const other = await app.inject({ method: 'POST', url: '/indoor/ar-token', headers: { authorization: 'Bearer other' } });
    expect(other.statusCode).toBe(200);
  });
});
