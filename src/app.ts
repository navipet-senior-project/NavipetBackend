import { randomUUID } from 'node:crypto';
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import { TypeBoxValidatorCompiler } from '@fastify/type-provider-typebox';

import { parseEnv, type Environment } from './config/env.js';
import authRoutes from './modules/auth/auth.routes.js';
import healthRoutes from './modules/health/health.routes.js';
import campusRoutes from './modules/campus/campus.routes.js';
import authPlugin, {
  SupabaseJwtVerifier,
  type JwtVerifier,
} from './plugins/auth.js';
import corsPlugin from './plugins/cors.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import mapboxSearchPlugin from './plugins/mapbox-search.js';
import type { ExternalPlacesGateway } from './modules/campus/campus.types.js';
import supabasePlugin, {
  type SupabaseResources,
} from './plugins/supabase.js';
import swaggerPlugin from './plugins/swagger.js';

export interface BuildAppOptions {
  env?: Environment;
  logger?: FastifyServerOptions['logger'];
  authVerifier?: JwtVerifier;
  supabaseResources?: SupabaseResources;
  externalPlaces?: ExternalPlacesGateway;
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
            'MAPBOX_ACCESS_TOKEN',
          ],
          censor: '[REDACTED]',
        },
      },
  });

  app.setValidatorCompiler(TypeBoxValidatorCompiler);
  app.decorate('config', config);
  const supabaseOptions = {
    ...(options.supabaseResources === undefined
      ? {}
      : { resources: options.supabaseResources }),
  };

  await app.register(errorHandlerPlugin);
  await app.register(corsPlugin);
  await app.register(rateLimitPlugin);
  await app.register(swaggerPlugin);
  await app.register(supabasePlugin, supabaseOptions);
  await app.register(mapboxSearchPlugin, {
    ...(options.externalPlaces === undefined
      ? {}
      : { gateway: options.externalPlaces }),
  });
  const authOptions = {
    verifier:
      options.authVerifier ??
      new SupabaseJwtVerifier(
        app.supabase,
        config.SUPABASE_JWT_ISSUER,
        config.SUPABASE_JWT_AUDIENCE,
      ),
  };
  await app.register(authPlugin, authOptions);
  await app.register(authRoutes);
  await app.register(campusRoutes);
  await app.register(healthRoutes);

  return app;
}
