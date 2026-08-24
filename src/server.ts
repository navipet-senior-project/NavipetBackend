import { pathToFileURL } from 'node:url';
import { config as loadEnvFile } from 'dotenv';
import type { FastifyInstance } from 'fastify';

import { buildApp } from './app.js';
import { parseEnv, type RawEnvironment } from './config/env.js';

type ShutdownSignal = 'SIGINT' | 'SIGTERM';

export interface SignalRegistrar {
  once(signal: ShutdownSignal, listener: () => Promise<void>): void;
}

const processSignals: SignalRegistrar = {
  once(signal, listener) {
    process.once(signal, () => {
      void listener();
    });
  },
};

export function registerShutdownHandlers(
  app: FastifyInstance,
  registrar: SignalRegistrar = processSignals,
): void {
  let closing = false;

  const register = (signal: ShutdownSignal): void => {
    registrar.once(signal, async () => {
      if (closing) return;
      closing = true;
      app.log.info({ signal }, 'Shutting down');
      try {
        await app.close();
      } catch {
        app.log.error({ signal }, 'Graceful shutdown failed');
        process.exitCode = 1;
      }
    });
  };

  register('SIGINT');
  register('SIGTERM');
}

export async function startServer(
  input: RawEnvironment = process.env,
  registrar: SignalRegistrar = processSignals,
): Promise<FastifyInstance> {
  const env = parseEnv(input);
  const app = await buildApp({ env });
  registerShutdownHandlers(app, registrar);
  const listenAddress = await app.listen({ host: env.HOST, port: env.PORT });
  if (env.DOCS_ENABLED) {
    const publicAddress = input.RENDER_EXTERNAL_URL ?? listenAddress;
    const swaggerUrl = new URL('/docs/', publicAddress).href;
    app.log.info(`Swagger UI available at ${swaggerUrl}`);
  }
  return app;
}

const entryPoint = process.argv[1];
if (
  entryPoint !== undefined &&
  import.meta.url === pathToFileURL(entryPoint).href
) {
  loadEnvFile();
  void startServer().catch(() => {
    console.error('Backend startup failed; check server configuration.');
    process.exitCode = 1;
  });
}
