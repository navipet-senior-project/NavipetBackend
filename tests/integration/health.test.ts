import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('downloads the OpenAPI document as pretty-printed JSON', async () => {
    app = await buildTestApp({ DOCS_ENABLED: true });
    const response = await app.inject({ method: 'GET', url: '/docs/openapi.json' });
    const original = await app.inject({ method: 'GET', url: '/docs/json' });
    const document: unknown = original.json();
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.headers['content-disposition']).toBe('attachment; filename="openapi.json"');
    expect(response.body).toBe(JSON.stringify(document, null, 2));
    expect(response.json()).toEqual(document);
  });

  it.each(['/docs', '/docs/'])('shows a working download link on %s', async (path) => {
    app = await buildTestApp({ DOCS_ENABLED: true });
    const script = await app.inject({ method: 'GET', url: '/docs/static/theme/download-openapi.js' });
    expect(script.statusCode).toBe(200);
    const link = { href: '', className: '', textContent: '' };
    const section = { className: '', appendChild: vi.fn() };
    const insertBefore = vi.fn();
    runInNewContext(script.body, {
      window: { location: { pathname: path } },
      document: {
        createElement: (tag: string) => tag === 'a' ? link : section,
        getElementById: () => ({}),
        body: { insertBefore },
      },
    });
    expect(link.href).toBe('/docs/openapi.json');
    expect(link.textContent).toContain('Download OpenAPI JSON');
    expect(section.appendChild).toHaveBeenCalledWith(link);
    expect(insertBefore).toHaveBeenCalledOnce();
  });

  it('does not register documentation routes when disabled', async () => {
    app = await buildTestApp({ DOCS_ENABLED: false });

    const response = await app.inject({ method: 'GET', url: '/docs/json' });

    expect(response.statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/docs/openapi.json' })).statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });
});
