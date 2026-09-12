import type { FastifyError, FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';

import { AppError } from '../common/errors/app-error.js';
import { ErrorCode } from '../common/errors/error-codes.js';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

function causeMessage(cause: unknown): string | undefined {
  if (cause instanceof Error) return cause.message;
  if (typeof cause !== 'object' || cause === null || !('message' in cause)) {
    return undefined;
  }
  const message = cause.message;
  return typeof message === 'string' ? message : undefined;
}

function causeShape(cause: unknown): { causeType: string; causeKeys?: string[]; causeText?: string } {
  if (cause === null) return { causeType: 'null' };
  if (typeof cause === 'object') {
    let serialized: string | undefined;
    try {
      serialized = JSON.stringify(cause);
    } catch {
      serialized = undefined;
    }
    return {
      causeType: 'object',
      causeKeys: Object.keys(cause),
      ...(serialized === undefined ? {} : { causeText: serialized }),
    };
  }
  if (typeof cause === 'undefined') return { causeType: 'undefined' };
  if (typeof cause === 'string') return { causeType: 'string', causeText: cause };
  if (typeof cause === 'number' || typeof cause === 'boolean' || typeof cause === 'bigint') {
    return { causeType: typeof cause, causeText: cause.toString() };
  }
  return { causeType: typeof cause };
}

function body(code: string, message: string, requestId: string): ErrorBody {
  return { error: { code, message, requestId } };
}

const invalidRequestParserCodes = new Set([
  'FST_ERR_CTP_EMPTY_JSON_BODY',
  'FST_ERR_CTP_INVALID_CONTENT_LENGTH',
  'FST_ERR_CTP_INVALID_JSON_BODY',
]);

const errorHandlerPlugin: FastifyPluginCallback = (fastify, _options, done) => {
  fastify.setNotFoundHandler((request, reply) => {
    return reply
      .status(404)
      .send(body(ErrorCode.NOT_FOUND, 'Resource not found', request.id));
  });

  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation !== undefined) {
      return reply
        .status(422)
        .send(body(ErrorCode.VALIDATION_ERROR, 'Invalid request', request.id));
    }

    if (invalidRequestParserCodes.has(error.code)) {
      return reply
        .status(400)
        .send(body(ErrorCode.INVALID_JSON, 'Malformed JSON', request.id));
    }

    if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
      return reply.status(415).send(
        body(
          ErrorCode.VALIDATION_ERROR,
          'Unsupported media type',
          request.id,
        ),
      );
    }

    if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.status(413).send(
        body(
          ErrorCode.VALIDATION_ERROR,
          'Request payload too large',
          request.id,
        ),
      );
    }

    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        const upstreamCause = error.originalCause ?? error.cause;
        const upstreamMessage =
          fastify.config.NODE_ENV === 'development'
            ? causeMessage(upstreamCause) ?? error.message
            : undefined;
        request.log.error(
          {
            errorCode: error.code,
            errorName: error.name,
            statusCode: error.statusCode,
            ...(upstreamMessage === undefined ? {} : { upstreamMessage }),
            ...(fastify.config.NODE_ENV === 'development'
              ? causeShape(upstreamCause)
              : {}),
          },
          'Application request failed',
        );
        return reply.status(error.statusCode).send(
          body(
            ErrorCode.INTERNAL_ERROR,
            'Internal server error',
            request.id,
          ),
        );
      }
      return reply
        .status(error.statusCode)
        .send(body(error.code, error.message, request.id));
    }

    request.log.error({ errorName: error.name }, 'Unhandled request failure');
    return reply.status(500).send(
      body(ErrorCode.INTERNAL_ERROR, 'Internal server error', request.id),
    );
  });

  done();
};

export default fp(errorHandlerPlugin, {
  fastify: '5.x',
  name: 'app-error-handler',
});
