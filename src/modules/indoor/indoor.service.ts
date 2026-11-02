import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { Environment } from '../../config/env.js';

interface IndoorToken {
  token: string;
  expiresOn: string;
}

const REFRESH_MARGIN_MS = 5 * 60_000;

export function createIndoorTokenService(
  config: Pick<Environment, 'MULTISET_CLIENT_ID' | 'MULTISET_CLIENT_SECRET'>,
  fetcher: typeof fetch = globalThis.fetch,
  now: () => number = Date.now,
) {
  // shortcut: cache is per process; use a shared store if deployment scales to multiple replicas.
  let cached: IndoorToken | undefined;
  let pending: Promise<IndoorToken> | undefined;

  async function exchange(clientId: string, clientSecret: string): Promise<IndoorToken> {
    try {
      const authorization = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const response = await fetcher('https://api.multiset.ai/v1/m2m/token', {
        method: 'POST',
        headers: { Authorization: `Basic ${authorization}` },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error('Upstream rejected token exchange');
      const payload: unknown = await response.json();
      if (
        typeof payload !== 'object' || payload === null ||
        ('error' in payload && payload.error != null && payload.error !== '') ||
        !('token' in payload) || typeof payload.token !== 'string' || payload.token.trim() === '' ||
        !('expiresOn' in payload) || typeof payload.expiresOn !== 'string' ||
        !Number.isFinite(Date.parse(payload.expiresOn)) ||
        Date.parse(payload.expiresOn) <= now() + REFRESH_MARGIN_MS
      ) {
        throw new Error('Invalid upstream token response');
      }
      cached = { token: payload.token, expiresOn: payload.expiresOn };
      return cached;
    } catch {
      // Upstream errors can contain credentials; never attach their payload or cause.
      throw new AppError({
        code: ErrorCode.UPSTREAM_ERROR,
        statusCode: 502,
        message: 'Indoor AR token exchange failed',
      });
    }
  }

  return {
    async getToken(): Promise<IndoorToken> {
      if (!config.MULTISET_CLIENT_ID || !config.MULTISET_CLIENT_SECRET) {
        throw new AppError({
          code: ErrorCode.INDOOR_AR_UNAVAILABLE,
          statusCode: 503,
          message: 'Indoor AR token service is not configured',
        });
      }
      if (cached && Date.parse(cached.expiresOn) > now() + REFRESH_MARGIN_MS) return cached;
      pending ??= exchange(config.MULTISET_CLIENT_ID, config.MULTISET_CLIENT_SECRET)
        .finally(() => { pending = undefined; });
      return pending;
    },
  };
}
