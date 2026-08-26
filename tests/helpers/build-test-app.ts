import type { FastifyInstance } from 'fastify';

import { buildApp, type BuildAppOptions } from '../../src/app.js';
import type { Environment } from '../../src/config/env.js';

export const TEST_ENV: Environment = Object.freeze({
  NODE_ENV: 'test',
  PORT: 3000,
  HOST: '127.0.0.1',
  LOG_LEVEL: 'silent',
  BODY_LIMIT_BYTES: 1_048_576,
  RATE_LIMIT_MAX: 100,
  RATE_LIMIT_WINDOW: '1 minute',
  AUTH_LOGIN_RATE_LIMIT_MAX: 10,
  AUTH_LOGIN_RATE_LIMIT_WINDOW: '1 minute',
  AUTH_REGISTER_RATE_LIMIT_MAX: 5,
  AUTH_REGISTER_RATE_LIMIT_WINDOW: '1 hour',
  AUTH_REFRESH_RATE_LIMIT_MAX: 30,
  AUTH_REFRESH_RATE_LIMIT_WINDOW: '1 minute',
  AUTH_FORGOT_PASSWORD_RATE_LIMIT_MAX: 5,
  AUTH_FORGOT_PASSWORD_RATE_LIMIT_WINDOW: '1 hour',
  AUTH_VERIFY_RESET_CODE_RATE_LIMIT_MAX: 10,
  AUTH_VERIFY_RESET_CODE_RATE_LIMIT_WINDOW: '15 minutes',
  DOCS_ENABLED: false,
  SUPABASE_URL: 'https://project-ref.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_JWT_ISSUER: 'https://project-ref.supabase.co/auth/v1',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  AUTH_EMAIL_REDIRECT_URL: 'navipet://auth-callback',
  CORS_ORIGINS: [],
});

export async function buildTestApp(
  overrides: Partial<Environment> = {},
  options: Omit<BuildAppOptions, 'env' | 'logger'> = {},
): Promise<FastifyInstance> {
  return buildApp({
    ...options,
    env: Object.freeze({ ...TEST_ENV, ...overrides }),
    logger: false,
  });
}
