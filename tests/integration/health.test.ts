import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildTestApp } from '../helpers/build-test-app.js';

describe('health routes', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it.each(['/health', '/api/v1/health'])(
    'returns liveness from %s',
    async (url) => {
      app = await buildTestApp();

      const response = await app.inject({ method: 'GET', url });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    },
  );
});
