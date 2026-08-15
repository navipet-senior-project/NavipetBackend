import { randomUUID } from 'node:crypto';
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import { TypeBoxValidatorCompiler } from '@fastify/type-provider-typebox';

import { parseEnv, type Environment } from './config/env.js';
import errorHandlerPlugin from './plugins/error-handler.js';

export interface BuildAppOptions {
  env?: Environment;
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const config = options.env ?? parseEnv(process.env);
  const app = Fastify({
    bodyLimit: config.BODY_LIMIT_BYTES,
    genReqId: () => randomUUID(),
    logger:
      options.logger ??
      {
        level: config.LOG_LEVEL,
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'SUPABASE_ANON_KEY',
            'SUPABASE_SERVICE_ROLE_KEY',
            'MULTISET_API_KEY',
          ],
          censor: '[REDACTED]',
        },
      },
  });

  app.setValidatorCompiler(TypeBoxValidatorCompiler);
  app.decorate('config', config);
  await app.register(errorHandlerPlugin);

  return app;
}
