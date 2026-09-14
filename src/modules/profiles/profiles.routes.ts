import type { FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';

import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import {
  GetProfileRouteSchema,
  UpdateProfileRouteSchema,
} from './profiles.schema.js';
import type { UpdateProfileInput } from './profiles.types.js';

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

  fastify.patch('/profiles/me', {
    preHandler: fastify.authenticate,
    schema: UpdateProfileRouteSchema,
  }, async (request) => {
    const input: UpdateProfileInput = {};
    if (request.body.displayName !== undefined) {
      const displayName = request.body.displayName.trim();
      if (displayName.length === 0) {
        throw new AppError({
          code: ErrorCode.VALIDATION_ERROR,
          statusCode: 422,
          message: 'Display name cannot be blank.',
        });
      }
      input.displayName = displayName;
    }
    if (request.body.email !== undefined) {
      input.email = request.body.email.trim().toLowerCase();
    }
    if (request.body.role !== undefined) input.role = request.body.role;

    try {
      const profile = await fastify.supabase.updateProfile(
        request.accessToken as string,
        request.user?.id as string,
        input,
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
