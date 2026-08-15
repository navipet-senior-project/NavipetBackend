import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../src/app.js';
import type { Environment } from '../../src/config/env.js';

export const TEST_ENV: Environment = Object.freeze({
  NODE_ENV: 'test',
  PORT: 3000,
  HOST: '127.0.0.1',
  LOG_LEVEL: 'silent',
  BODY_LIMIT_BYTES: 1_048_576,
  RATE_LIMIT_MAX: 100,
  RATE_LIMIT_WINDOW: '1 minute',
  DOCS_ENABLED: false,
  SUPABASE_URL: 'https://project-ref.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_JWT_ISSUER: 'https://project-ref.supabase.co/auth/v1',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  CORS_ORIGINS: [],
});

export async function buildTestApp(
  overrides: Partial<Environment> = {},
): Promise<FastifyInstance> {
  return buildApp({
    env: Object.freeze({ ...TEST_ENV, ...overrides }),
    logger: false,
  });
}
