import { randomUUID } from 'node:crypto';
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import { TypeBoxValidatorCompiler } from '@fastify/type-provider-typebox';

import { parseEnv, type Environment } from './config/env.js';
import healthRoutes from './modules/health/health.routes.js';
import authPlugin, {
  SupabaseJwtVerifier,
  type JwtVerifier,
} from './plugins/auth.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import supabasePlugin, {
  type SupabaseResources,
} from './plugins/supabase.js';

export interface BuildAppOptions {
  env?: Environment;
  logger?: FastifyServerOptions['logger'];
  authVerifier?: JwtVerifier;
  supabaseResources?: SupabaseResources;
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
  await app.register(supabasePlugin, {
    ...(options.supabaseResources === undefined
      ? {}
      : { resources: options.supabaseResources }),
  });
  await app.register(authPlugin, {
    verifier:
      options.authVerifier ??
      new SupabaseJwtVerifier(
        app.supabase,
        config.SUPABASE_JWT_ISSUER,
        config.SUPABASE_JWT_AUDIENCE,
      ),
  });
  await app.register(healthRoutes);

  return app;
}
