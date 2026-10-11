import multipart, { type MultipartFile } from '@fastify/multipart';
import type {
  FastifyPluginAsyncTypebox,
  FastifyPluginCallbackTypebox,
} from '@fastify/type-provider-typebox';
import type { FastifyRequest } from 'fastify';

import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { detectAvatarContentType } from './profiles.avatar.js';
import {
  GetProfileRouteSchema,
  DeleteAvatarRouteSchema,
  UploadAvatarRouteSchema,
  UpdateProfileRouteSchema,
} from './profiles.schema.js';
import {
  AVATAR_FIELD_NAME,
  AVATAR_MAX_BYTES,
  type UpdateProfileInput,
} from './profiles.types.js';

function errorCode(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) {
    return undefined;
  }
  return typeof cause.code === 'string' ? cause.code : undefined;
}

// Everything that can fail while reading the multipart body is the client's
// request, never Storage, so it maps to 4xx rather than the handler's 502.
async function readAvatarUpload(request: FastifyRequest): Promise<Buffer> {
  let file: MultipartFile | undefined;
  try {
    file = await request.file();
    if (file === undefined) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        statusCode: 400,
        message: 'An image file is required.',
      });
    }
    if (file.fieldname !== AVATAR_FIELD_NAME) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        statusCode: 400,
        message: `Upload the image in the "${AVATAR_FIELD_NAME}" field.`,
      });
    }
    return await file.toBuffer();
  } catch (cause) {
    if (cause instanceof AppError) throw cause;
    const code = errorCode(cause);
    if (code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        statusCode: 415,
        message: 'Request must be multipart/form-data.',
        cause,
      });
    }
    if (code === 'FST_REQ_FILE_TOO_LARGE') {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        statusCode: 413,
        message: 'Avatar image must be 5 MB or smaller.',
        cause,
      });
    }
    throw new AppError({
      code: ErrorCode.VALIDATION_ERROR,
      statusCode: 400,
      message: 'Malformed multipart request.',
      cause,
    });
  }
}

// Multipart parsing is registered only in this scope so no other route
// accepts multipart bodies.
const avatarUploadRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  await fastify.register(multipart, {
    limits: { files: 1, fileSize: AVATAR_MAX_BYTES },
  });

  fastify.post('/profiles/me/avatar', {
    preHandler: fastify.authenticate,
    // The body is read by request.file(), not validated against the schema;
    // the body schema exists only to render a file picker in Swagger UI.
    validatorCompiler: () => () => true,
    schema: UploadAvatarRouteSchema,
  }, async (request) => {
    const data = await readAvatarUpload(request);
    const contentType = detectAvatarContentType(data);
    if (contentType === null) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        statusCode: 415,
        message: 'Only JPEG, PNG, and WebP images are supported.',
      });
    }
    try {
      return await fastify.supabase.uploadProfileAvatar(
        request.user?.id as string,
        contentType,
        data,
      );
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
};

const profilesRoutes: FastifyPluginCallbackTypebox = (fastify, _options, done) => {
  fastify.register(avatarUploadRoutes);

  fastify.delete('/profiles/me/avatar/:uploadId', {
    preHandler: fastify.authenticate,
    schema: DeleteAvatarRouteSchema,
  }, async (request, reply) => {
    try {
      const deleted = await fastify.supabase.discardProfileAvatar(
        request.user?.id as string,
        request.params.uploadId,
      );
      if (!deleted) {
        throw new AppError({
          code: ErrorCode.NOT_FOUND,
          statusCode: 404,
          message: 'Temporary avatar not found.',
        });
      }
      return await reply.code(204).send();
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
    if (request.body.role !== undefined) input.role = request.body.role;
    if (request.body.avatarUploadId !== undefined) input.avatarUploadId = request.body.avatarUploadId;

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
