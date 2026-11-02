import type { FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';
import { createIndoorTokenService } from './indoor.service.js';
import { IndoorTokenRouteSchema } from './indoor.schema.js';

const indoorRoutes: FastifyPluginCallbackTypebox = (fastify, _options, done) => {
  const service = createIndoorTokenService(fastify.config);
  fastify.post('/indoor/ar-token', {
    preHandler: fastify.authenticate,
    config: {
      rateLimit: {
        hook: 'preHandler',
        max: 5,
        timeWindow: '1 minute',
        keyGenerator: (request) => request.user?.id ?? request.ip,
      },
    },
    schema: IndoorTokenRouteSchema,
  }, async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return service.getToken();
  });
  done();
};

export default indoorRoutes;
