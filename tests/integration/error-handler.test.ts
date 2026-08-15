import Type from 'typebox';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildTestApp } from '../helpers/build-test-app.js';

const anyString = expect.any(String) as unknown;

describe('error handling', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('maps request schema failures to VALIDATION_ERROR', async () => {
    app = await buildTestApp();
    app.post(
      '/__test/validate',
      { schema: { body: Type.Object({ name: Type.String() }) } },
      () => ({ accepted: true }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/__test/validate',
      payload: { name: 42 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        requestId: anyString,
      },
    });
  });

  it('maps unknown routes to NOT_FOUND', async () => {
    app = await buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/missing' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
        requestId: anyString,
      },
    });
  });

  it('hides unexpected error details', async () => {
    app = await buildTestApp();
    app.get('/__test/boom', () => {
      throw new Error('database password leaked here');
    });

    const response = await app.inject({ method: 'GET', url: '/__test/boom' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        requestId: anyString,
      },
    });
    expect(response.body).not.toContain('database password leaked here');
    expect(response.body).not.toContain('stack');
  });

  it('rejects payloads above the configured byte limit', async () => {
    app = await buildTestApp({ BODY_LIMIT_BYTES: 24 });
    app.post('/__test/body-limit', () => ({ accepted: true }));

    const response = await app.inject({
      method: 'POST',
      url: '/__test/body-limit',
      payload: { value: 'this body exceeds twenty-four bytes' },
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request payload too large',
        requestId: anyString,
      },
    });
  });
});
