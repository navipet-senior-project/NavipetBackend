import type { FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';

import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { GetProfileRouteSchema } from './profiles.schema.js';

const profilesRoutes: FastifyPluginCallbackTypebox = (fastify, _options, done) => {
  fastify.get('/profiles/me', {
    preHandler: fastify.authenticate,
    schema: GetProfileRouteSchema,
  }, async (request) => {
    try {
      const profile = await fastify.supabase.getProfileByUserId(
        request.accessToken as string,
      );
      if (profile === null) {
        throw new AppError({
          code: ErrorCode.NOT_FOUND,
          statusCode: 404,
          message: 'Profile not found.',
        });
      }
      return { profile };
    } catch (cause) {
      if (cause instanceof AppError) throw cause;
      throw new AppError({
        code: ErrorCode.UPSTREAM_ERROR,
        statusCode: 502,
        message: 'Profile storage unavailable.',
        cause,
      });
    }
  });

  done();
};

export default profilesRoutes;
