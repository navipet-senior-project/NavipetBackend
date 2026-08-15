import Type from 'typebox';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { AppError } from '../../src/common/errors/app-error.js';
import { ErrorCode } from '../../src/common/errors/error-codes.js';
import { buildApp } from '../../src/app.js';
import { buildTestApp } from '../helpers/build-test-app.js';
import { TEST_ENV } from '../helpers/build-test-app.js';

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

  it('logs only safe metadata for unexpected errors', async () => {
    const logLines: string[] = [];
    const secretMessage = 'database password leaked to logs';
    const secretCause = 'private service token leaked to logs';
    const secretStack = 'private-stack-trace-leaked-to-logs';

    app = await buildApp({
      env: TEST_ENV,
      logger: {
        level: 'error',
        stream: {
          write: (line) => {
            logLines.push(line);
          },
        },
      },
    });
    app.get('/__test/log-secret', () => {
      const error = new Error(secretMessage, {
        cause: new Error(secretCause),
      });
      error.stack = secretStack;
      throw error;
    });

    await app.inject({ method: 'GET', url: '/__test/log-secret' });

    const logs = logLines.join('\n');
    expect(logs).toContain('"errorName":"Error"');
    expect(logs).not.toContain(secretMessage);
    expect(logs).not.toContain(secretCause);
    expect(logs).not.toContain(secretStack);
  });

  it('hides 5xx AppError details from clients and logs', async () => {
    const logLines: string[] = [];
    const secretMessage = 'database credentials leaked to client';
    const secretCause = 'private service token leaked to client';
    const secretStack = 'private-stack-trace-leaked-to-client';

    app = await buildApp({
      env: TEST_ENV,
      logger: {
        level: 'error',
        stream: {
          write: (line) => {
            logLines.push(line);
          },
        },
      },
    });
    app.get('/__test/app-error-secret', () => {
      const error = new AppError({
        code: ErrorCode.DATABASE_ERROR,
        statusCode: 503,
        message: secretMessage,
        cause: new Error(secretCause),
      });
      error.stack = secretStack;
      throw error;
    });

    const response = await app.inject({
      method: 'GET',
      url: '/__test/app-error-secret',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        requestId: anyString,
      },
    });
    expect(response.body).not.toContain(secretMessage);

    const logs = logLines.join('\n');
    expect(logs).toContain('"errorCode":"DATABASE_ERROR"');
    expect(logs).toContain('"statusCode":503');
    expect(logs).not.toContain(secretMessage);
    expect(logs).not.toContain(secretCause);
    expect(logs).not.toContain(secretStack);
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
