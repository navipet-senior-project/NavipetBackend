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

function body(code: string, message: string, requestId: string): ErrorBody {
  return { error: { code, message, requestId } };
}

const errorHandlerPlugin: FastifyPluginCallback = (fastify, _options, done) => {
  fastify.setNotFoundHandler((request, reply) => {
    return reply
      .status(404)
      .send(body(ErrorCode.NOT_FOUND, 'Resource not found', request.id));
  });

  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation !== undefined) {
      return reply
        .status(400)
        .send(body(ErrorCode.VALIDATION_ERROR, 'Invalid request', request.id));
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
        request.log.error(
          {
            errorCode: error.code,
            errorName: error.name,
            statusCode: error.statusCode,
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
