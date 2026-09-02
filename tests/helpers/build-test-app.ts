import type { FastifyInstance } from 'fastify';

import { buildApp, type BuildAppOptions } from '../../src/app.js';
import type { Environment } from '../../src/config/env.js';

export const TEST_ENV: Environment = Object.freeze({
  NODE_ENV: 'test',
  PORT: 3000,
  HOST: '127.0.0.1',
  LOG_LEVEL: 'silent',
  BODY_LIMIT_BYTES: 1_048_576,
  RATE_LIMIT_MAX: 250,
  RATE_LIMIT_WINDOW: '1 hour',
  AUTH_LOGIN_RATE_LIMIT_MAX: 250,
  AUTH_LOGIN_RATE_LIMIT_WINDOW: '1 hour',
  AUTH_REGISTER_RATE_LIMIT_MAX: 250,
  AUTH_REGISTER_RATE_LIMIT_WINDOW: '1 hour',
  AUTH_REFRESH_RATE_LIMIT_MAX: 250,
  AUTH_REFRESH_RATE_LIMIT_WINDOW: '1 hour',
  AUTH_FORGOT_PASSWORD_RATE_LIMIT_MAX: 250,
  AUTH_FORGOT_PASSWORD_RATE_LIMIT_WINDOW: '1 hour',
  AUTH_VERIFY_OTP_RATE_LIMIT_MAX: 250,
  AUTH_VERIFY_OTP_RATE_LIMIT_WINDOW: '1 hour',
  DOCS_ENABLED: false,
  SUPABASE_URL: 'https://project-ref.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_JWT_ISSUER: 'https://project-ref.supabase.co/auth/v1',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
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
