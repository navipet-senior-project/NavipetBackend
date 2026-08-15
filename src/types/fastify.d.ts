import 'fastify';

import type { Environment } from '../config/env.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Environment;
  }
}
