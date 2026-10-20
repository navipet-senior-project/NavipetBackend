import { randomUUID } from 'node:crypto';
import pretty from 'pino-pretty';
import Fastify, {
  LogController,
  type FastifyInstance,
  type FastifyRequest,
  type FastifyServerOptions,
} from 'fastify';
import { TypeBoxValidatorCompiler } from '@fastify/type-provider-typebox';

import { parseEnv, type Environment } from './config/env.js';
import {
  getLoggerOptions,
  getPrettyOptions,
  formatDuration,
  requestLogUrl,
} from './config/logging.js';
import authRoutes from './modules/auth/auth.routes.js';
import healthRoutes from './modules/health/health.routes.js';
import campusRoutes from './modules/campus/campus.routes.js';
import recentSearchesRoutes from './modules/recent-searches/recent-searches.routes.js';
import classesRoutes from './modules/classes/classes.routes.js';
import profilesRoutes from './modules/profiles/profiles.routes.js';
import accessibilityRoutes from './modules/accessibility/accessibility.routes.js';
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
    ...(config.LOG_PRETTY
      ? { logController: new LogController({ disableRequestLogging: true }) }
      : {}),
    logger: options.logger ?? {
      ...getLoggerOptions(config),
      ...(config.LOG_PRETTY
        ? { stream: pretty(getPrettyOptions(config, process.stdout.isTTY)) }
        : {}),
    },
  });

  app.setValidatorCompiler(TypeBoxValidatorCompiler);
  app.decorate('config', config);
  if (config.LOG_PRETTY) {
    const errors = new WeakMap<FastifyRequest, Error>();
    app.addHook('onError', (request, _reply, error, done) => {
      errors.set(request, error);
      done();
    });
    app.addHook('onResponse', (request, reply, done) => {
      const error = errors.get(request);
      const fields = error === undefined ? {} : {
        err: { type: error.name, message: error.message, stack: error.stack },
      };
      const message = `${request.method} ${requestLogUrl(request.url)} ${String(reply.statusCode)} ${formatDuration(reply.elapsedTime)}`;
      if (reply.statusCode >= 500) request.log.error(fields, message);
      else if (reply.statusCode >= 400) request.log.warn(fields, message);
      else request.log.info(fields, message);
      done();
    });
  }

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
  await app.register(recentSearchesRoutes);
  await app.register(classesRoutes);
  await app.register(profilesRoutes);
  await app.register(accessibilityRoutes);
  await app.register(healthRoutes);

  return app;
}
