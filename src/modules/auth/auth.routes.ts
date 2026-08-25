import type { FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';

import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { API_V1_PREFIX } from '../../config/constants.js';
import { LoginRouteSchema } from './auth.schema.js';

const authRoutes: FastifyPluginCallbackTypebox = (fastify, _options, done) => {
  const handler = async (request: {
    body: { email: string; password: string };
  }): Promise<{ access_token: string; refresh_token: string }> => {
    let tokens;
    try {
      tokens = await fastify.supabase.signInWithPassword(request.body);
    } catch (cause) {
      throw new AppError({
        code: ErrorCode.UPSTREAM_ERROR,
        statusCode: 502,
        message: 'Supabase authentication unavailable',
        cause,
      });
    }
    if (tokens === null) {
      throw new AppError({
        code: ErrorCode.UNAUTHORIZED,
        statusCode: 401,
        message: 'Invalid email or password',
      });
    }
    return {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    };
  };
  const options = { schema: LoginRouteSchema };

  fastify.post('/auth/login', options, handler);
  fastify.post(`${API_V1_PREFIX}/auth/login`, options, handler);

  done();
};

export default authRoutes;
