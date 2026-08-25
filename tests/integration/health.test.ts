import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildTestApp } from '../helpers/build-test-app.js';

const anyObject = expect.any(Object) as unknown;

describe('health routes', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('returns liveness from /health', async () => {
    app = await buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});

describe('OpenAPI documentation', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('serves OpenAPI JSON when docs are enabled', async () => {
    app = await buildTestApp({ DOCS_ENABLED: true });

    const response = await app.inject({ method: 'GET', url: '/docs/json' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      openapi: '3.0.3',
      info: { title: 'NaviPet API', version: '1.0.0' },
      paths: {
        '/health': anyObject,
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    });
  });

  it('does not register documentation routes when disabled', async () => {
    app = await buildTestApp({ DOCS_ENABLED: false });

    const response = await app.inject({ method: 'GET', url: '/docs/json' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });
});
