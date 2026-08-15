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
});
