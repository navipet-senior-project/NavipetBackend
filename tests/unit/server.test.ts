import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

import {
  registerShutdownHandlers,
  type SignalRegistrar,
} from '../../src/server.js';

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
