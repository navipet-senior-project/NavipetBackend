import type { FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';

import { API_V1_PREFIX } from '../../config/constants.js';
import { HealthRouteSchema } from './health.schema.js';

const healthRoutes: FastifyPluginCallbackTypebox = (fastify, _options, done) => {
  const handler = (): { status: 'ok' } => ({ status: 'ok' });
  const options = {
    config: { rateLimit: false },
    schema: HealthRouteSchema,
  };

  fastify.get('/health', options, handler);
  fastify.get(`${API_V1_PREFIX}/health`, options, handler);

  done();
};

export default healthRoutes;
