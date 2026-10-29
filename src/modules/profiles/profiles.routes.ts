import multipart from '@fastify/multipart';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { FastifyRequest } from 'fastify';

import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { detectAvatarContentType } from './profiles.avatar.js';
import {
  GetProfileRouteSchema,
  UpdateProfileRouteSchema,
} from './profiles.schema.js';
import {
  AVATAR_FIELD_NAME,
  AVATAR_MAX_BYTES,
  ProfileRoles,
  type UpdateProfileInput,
} from './profiles.types.js';

interface ParsedProfileUpdate {
  input: UpdateProfileInput;
  avatarBytes?: Buffer;
}

function errorCode(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) {
    return undefined;
  }
  return typeof cause.code === 'string' ? cause.code : undefined;
}

function validationError(message: string, statusCode = 422): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    statusCode,
    message,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseProfileFields(fields: Record<string, unknown>): UpdateProfileInput {
  const allowed = new Set(['displayName', 'role']);
  for (const key of Object.keys(fields)) {
    if (!allowed.has(key)) throw validationError(`Unexpected profile field: ${key}.`);
  }
  if (Object.keys(fields).length === 0) {
    throw validationError('Send at least one profile field or avatar.');
  }

  const input: UpdateProfileInput = {};
  if (fields.displayName !== undefined) {
    if (typeof fields.displayName !== 'string' || fields.displayName.length < 1 || fields.displayName.length > 80) {
      throw validationError('displayName must be a string between 1 and 80 characters.');
    }
    const displayName = fields.displayName.trim();
    if (displayName.length === 0) throw validationError('Display name cannot be blank.');
    input.displayName = displayName;
  }
  if (fields.role !== undefined) {
    if (typeof fields.role !== 'string' || !ProfileRoles.includes(fields.role as (typeof ProfileRoles)[number])) {
      throw validationError('role must be student or professor.');
    }
    input.role = fields.role as (typeof ProfileRoles)[number];
  }
  return input;
}

function parseJsonProfileUpdate(body: unknown): ParsedProfileUpdate {
  if (!isRecord(body)) throw validationError('The request body must be an object.', 400);
  const input = parseProfileFields(body);
  return { input };
}

async function readMultipartProfileUpdate(request: FastifyRequest): Promise<ParsedProfileUpdate> {
  const fields: Record<string, unknown> = {};
  let avatarBytes: Buffer | undefined;
  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== AVATAR_FIELD_NAME || avatarBytes !== undefined) {
          throw validationError(`Send no more than one file in the "${AVATAR_FIELD_NAME}" field.`, 400);
        }
        avatarBytes = await part.toBuffer();
      } else {
        if (part.fieldname === AVATAR_FIELD_NAME) {
          throw validationError('The avatar field must contain an image file.', 400);
        }
        if (Object.hasOwn(fields, part.fieldname)) {
          throw validationError(`Duplicate profile field: ${part.fieldname}.`, 400);
        }
        fields[part.fieldname] = part.value;
      }
    }
  } catch (cause) {
    if (cause instanceof AppError) throw cause;
    const code = errorCode(cause);
    if (code === 'FST_REQ_FILE_TOO_LARGE') {
      throw validationError('Avatar image must be 5 MB or smaller.', 413);
    }
    if (code === 'FST_PARTS_LIMIT' || code === 'FST_FILES_LIMIT' || code === 'FST_FIELDS_LIMIT') {
      throw validationError('Multipart request contains too many fields or files.', 400);
    }
    throw validationError('Malformed multipart request.', 400);
  }

  if (Object.keys(fields).length === 0 && avatarBytes === undefined) {
    throw validationError('Send at least one profile field or avatar.');
  }
  return {
    input: Object.keys(fields).length === 0 ? {} : parseProfileFields(fields),
    ...(avatarBytes === undefined ? {} : { avatarBytes }),
  };
}

// Multipart parsing is registered only in this plugin scope so no other route
// accepts multipart bodies.
const profilesRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  await fastify.register(multipart, {
    limits: { files: 1, fields: 2, parts: 3, fileSize: AVATAR_MAX_BYTES },
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
    // JSON and multipart payloads are parsed separately below. This keeps the
    // OpenAPI schema useful while allowing Fastify's multipart stream parser.
    validatorCompiler: () => () => true,
    schema: UpdateProfileRouteSchema,
  }, async (request) => {
    const parsed = request.isMultipart()
      ? await readMultipartProfileUpdate(request)
      : parseJsonProfileUpdate(request.body);
    const input = parsed.input;

    if (parsed.avatarBytes !== undefined) {
      const contentType = detectAvatarContentType(parsed.avatarBytes);
      if (contentType === null) {
        throw validationError('Only JPEG, PNG, and WebP images are supported.', 415);
      }
      input.avatar = { contentType, data: parsed.avatarBytes };
    }

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
};

export default profilesRoutes;
