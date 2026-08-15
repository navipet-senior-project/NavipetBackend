import rateLimit from '@fastify/rate-limit';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import { AppError } from '../common/errors/app-error.js';
import { ErrorCode } from '../common/errors/error-codes.js';

const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(rateLimit, {
    global: true,
    max: fastify.config.RATE_LIMIT_MAX,
    timeWindow: fastify.config.RATE_LIMIT_WINDOW,
    errorResponseBuilder(_request, context) {
      return new AppError({
        code: ErrorCode.RATE_LIMITED,
        statusCode: context.statusCode,
        message: 'Too many requests',
      });
    },
  });
};

export default fp(rateLimitPlugin, {
  fastify: '5.x',
  name: 'app-rate-limit',
});
