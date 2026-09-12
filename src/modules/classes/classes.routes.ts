import type { FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';

import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { createClassesService } from './classes.service.js';
import { CreateClassRouteSchema, DeleteClassRouteSchema, ListClassesRouteSchema, UpdateClassRouteSchema } from './classes.schema.js';

async function storageOperation<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (cause) {
    if (cause instanceof AppError) throw cause;
    throw new AppError({ code: ErrorCode.UPSTREAM_ERROR, statusCode: 502, message: 'Class storage unavailable', cause });
  }
}

const classesRoutes: FastifyPluginCallbackTypebox = (fastify, _options, done) => {
  const service = createClassesService(fastify.supabase);

  fastify.get('/classes', { preHandler: fastify.authenticate, schema: ListClassesRouteSchema }, async (request) => ({
    classes: await storageOperation(() => service.list(request.accessToken as string)),
  }));

  fastify.post('/classes', { preHandler: fastify.authenticate, schema: CreateClassRouteSchema }, async (request, reply) => {
    const userId = request.user?.id;
    if (userId === undefined) {
      throw new AppError({ code: ErrorCode.INVALID_ACCESS_TOKEN, statusCode: 401, message: 'Authentication required' });
    }
    const created = await storageOperation(() => service.create(request.accessToken as string, userId, request.body));
    return reply.code(201).send({ class: created });
  });

  fastify.patch('/classes/:classId', { preHandler: fastify.authenticate, schema: UpdateClassRouteSchema }, async (request) => {
    if (Object.keys(request.body).length === 0) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        statusCode: 422,
        message: 'At least one class field is required.',
      });
    }
    const updated = await storageOperation(() => service.update(request.accessToken as string, request.params.classId, request.body));
    if (updated === null) throw new AppError({ code: ErrorCode.NOT_FOUND, statusCode: 404, message: 'Class not found.' });
    return { class: updated };
  });

  fastify.delete('/classes/:classId', { preHandler: fastify.authenticate, schema: DeleteClassRouteSchema }, async (request, reply) => {
    const deleted = await storageOperation(() => service.delete(request.accessToken as string, request.params.classId));
    if (!deleted) throw new AppError({ code: ErrorCode.NOT_FOUND, statusCode: 404, message: 'Class not found.' });
    return reply.code(204).send();
  });

  done();
};

export default classesRoutes;
