import { describe, expect, it, vi } from 'vitest';
import { createIndoorTokenService } from '../../src/modules/indoor/indoor.service.js';

const credentials = { MULTISET_CLIENT_ID: 'test-client', MULTISET_CLIENT_SECRET: 'test-secret' };
const start = Date.parse('2026-11-02T00:00:00Z');
const upstream = { token: 'temporary-token', expiresOn: '2026-11-02T00:30:00Z', error: null };

describe('indoor token service', () => {
  it('exchanges Basic credentials without a body and exposes only token and expiresOn', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ...upstream, clientSecret: 'ignored' }));
    const service = createIndoorTokenService(credentials, fetcher, () => start);
    expect(await service.getToken()).toEqual({ token: 'temporary-token', expiresOn: '2026-11-02T00:30:00Z' });
    expect(fetcher).toHaveBeenCalledWith('https://api.multiset.ai/v1/m2m/token', {
      method: 'POST', headers: { Authorization: 'Basic dGVzdC1jbGllbnQ6dGVzdC1zZWNyZXQ=' },
      redirect: 'error', signal: expect.any(AbortSignal) as unknown,
    });
  });

  it.each([{}, { MULTISET_CLIENT_ID: 'test-client' }, { MULTISET_CLIENT_SECRET: 'test-secret' }])('rejects missing credentials without fetching: %j', async (config) => {
    const fetcher = vi.fn();
    await expect(createIndoorTokenService(config, fetcher).getToken()).rejects.toMatchObject({ code: 'INDOOR_AR_UNAVAILABLE', statusCode: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reuses one token across concurrent calls and refreshes at five minutes remaining', async () => {
    let now = start;
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ ...upstream, expiresOn: new Date(now + 1_800_000).toISOString() })));
    const service = createIndoorTokenService(credentials, fetcher, () => now);
    await Promise.all([service.getToken(), service.getToken(), service.getToken()]);
    now = start + 1_499_999;
    expect((await service.getToken()).token).toBe('temporary-token');
    expect(fetcher).toHaveBeenCalledTimes(1);
    now = start + 1_500_000;
    expect((await service.getToken()).expiresOn).toBe('2026-11-02T00:55:00.000Z');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    () => Promise.resolve(new Response('test-secret', { status: 403 })),
    () => Promise.reject(new Error('test-client:test-secret')),
    () => Promise.resolve(new Response('invalid json')),
    () => Promise.resolve(Response.json({ ...upstream, error: 'test-secret' })),
    () => Promise.resolve(Response.json({ ...upstream, token: '' })),
    () => Promise.resolve(Response.json({ ...upstream, expiresOn: 'bad-date' })),
    () => Promise.resolve(Response.json({ ...upstream, expiresOn: '2026-11-02T00:05:00Z' })),
  ])('rejects unsafe upstream output without retaining credentials or response data', async (fetcher) => {
    const service = createIndoorTokenService(credentials, fetcher, () => start);
    const error: unknown = await service.getToken().catch((cause: unknown) => cause);
    expect(error).toMatchObject({ code: 'UPSTREAM_ERROR', statusCode: 502 });
    expect(error).toHaveProperty('cause', undefined);
    expect(JSON.stringify(error)).not.toContain('test-secret');
    expect(JSON.stringify(error)).not.toContain('test-client');
  });

  it('releases the pending request after failure so a later call can recover', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce(Response.json(upstream));
    const service = createIndoorTokenService(credentials, fetcher, () => start);
    await expect(service.getToken()).rejects.toMatchObject({ statusCode: 502 });
    expect(await service.getToken()).toEqual({ token: 'temporary-token', expiresOn: '2026-11-02T00:30:00Z' });
  });
});
