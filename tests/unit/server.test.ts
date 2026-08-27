import { createServer } from 'node:net';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

import {
  registerShutdownHandlers,
  startServer,
  type SignalRegistrar,
} from '../../src/server.js';

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Failed to allocate a test port');
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve();
      else reject(error);
    });
  });
  return address.port;
}

const REQUIRED_ENV = {
  NODE_ENV: 'production',
  HOST: '127.0.0.1',
  LOG_LEVEL: 'info',
  BODY_LIMIT_BYTES: '1048576',
  RATE_LIMIT_MAX: '100',
  RATE_LIMIT_WINDOW: '1 minute',
  SUPABASE_URL: 'https://project-ref.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_JWT_ISSUER: 'https://project-ref.supabase.co/auth/v1',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  CORS_ORIGINS: 'https://example.com',
} as const;

const ignoreSignals: SignalRegistrar = {
  once() {},
};

describe('startServer', () => {
  it('logs the public Swagger URL when documentation is enabled', async () => {
    const logLines: string[] = [];
    const stdout = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk) => {
        logLines.push(String(chunk));
        return true;
      });
    let app: FastifyInstance | undefined;

    try {
      app = await startServer(
        {
          ...REQUIRED_ENV,
          PORT: String(await availablePort()),
          DOCS_ENABLED: 'true',
          RENDER_EXTERNAL_URL: 'https://navipetbackend.onrender.com',
        },
        ignoreSignals,
      );

      expect(logLines.join('\n')).toContain(
        'Swagger UI available at https://navipetbackend.onrender.com/docs/',
      );
    } finally {
      stdout.mockRestore();
      await app?.close();
    }
  });

  it('does not log a Swagger URL when documentation is disabled', async () => {
    const logLines: string[] = [];
    const stdout = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk) => {
        logLines.push(String(chunk));
        return true;
      });
    let app: FastifyInstance | undefined;

    try {
      app = await startServer(
        {
          ...REQUIRED_ENV,
          PORT: String(await availablePort()),
          DOCS_ENABLED: 'false',
          RENDER_EXTERNAL_URL: 'https://navipetbackend.onrender.com',
        },
        ignoreSignals,
      );

      expect(logLines.join('\n')).not.toContain('Swagger UI available at');
    } finally {
      stdout.mockRestore();
      await app?.close();
    }
  });
});

describe('registerShutdownHandlers', () => {
  it('registers both termination signals and closes once', async () => {
    const listeners = new Map<'SIGINT' | 'SIGTERM', () => Promise<void>>();
    const registrar: SignalRegistrar = {
      once(signal, listener) {
        listeners.set(signal, listener);
      },
    };
    const close = vi.fn().mockResolvedValue(undefined);
    const app = {
      close,
      log: { info: vi.fn(), error: vi.fn() },
    } as unknown as FastifyInstance;

    registerShutdownHandlers(app, registrar);
    await listeners.get('SIGTERM')?.();
    await listeners.get('SIGINT')?.();

    expect(listeners.has('SIGINT')).toBe(true);
    expect(listeners.has('SIGTERM')).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('logs only fixed metadata when close rejects', async () => {
    const logLines: string[] = [];
    const loggerApp = Fastify({
      logger: {
        level: 'error',
        stream: {
          write(line) {
            logLines.push(line);
          },
        },
      },
    });
    const listeners = new Map<'SIGINT' | 'SIGTERM', () => Promise<void>>();
    const secretMessage = 'shutdown secret message';
    const secretCause = 'shutdown secret cause';
    const secretStack = 'shutdown-secret-stack';
    const closeError = new Error(secretMessage, {
      cause: new Error(secretCause),
    });
    closeError.stack = secretStack;
    const app = {
      close: vi.fn().mockRejectedValue(closeError),
      log: loggerApp.log,
    } as unknown as FastifyInstance;
    const previousExitCode = process.exitCode;

    try {
      registerShutdownHandlers(app, {
        once(signal, listener) {
          listeners.set(signal, listener);
        },
      });
      await listeners.get('SIGTERM')?.();

      const logs = logLines.join('\n');
      expect(logs).toContain('"signal":"SIGTERM"');
      expect(logs).toContain('Graceful shutdown failed');
      expect(logs).not.toContain(secretMessage);
      expect(logs).not.toContain(secretCause);
      expect(logs).not.toContain(secretStack);
    } finally {
      process.exitCode = previousExitCode;
      await loggerApp.close();
    }
  });
});
