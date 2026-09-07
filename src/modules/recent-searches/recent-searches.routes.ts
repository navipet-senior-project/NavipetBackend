import type { FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';

import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { createCampusService } from '../campus/campus.service.js';
import {
  ClearRecentSearchesRouteSchema,
  CreateRecentSearchRouteSchema,
  ListRecentSearchesRouteSchema,
} from './recent-searches.schema.js';

async function storageOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause) {
    if (cause instanceof AppError) throw cause;
    throw new AppError({
      code: ErrorCode.UPSTREAM_ERROR,
      statusCode: 502,
      message: 'Recent search storage unavailable',
      cause,
    });
  }
}

const recentSearchesRoutes: FastifyPluginCallbackTypebox = (fastify, _options, done) => {
  const campusService = createCampusService({
    campusPlaces: fastify.supabase,
    externalPlaces: fastify.externalPlaces,
  });

  fastify.post('/recent-searches', {
    preHandler: fastify.authenticate,
    schema: CreateRecentSearchRouteSchema,
  }, async (request, reply) => {
    const place = await storageOperation(() => campusService.findPlace(request.body.placeId));
    if (place === null) {
      throw new AppError({
        code: ErrorCode.NOT_FOUND,
        statusCode: 404,
        message: 'Campus place not found.',
      });
    }
    await storageOperation(() =>
      fastify.supabase.saveRecentSearch(request.accessToken as string, place),
    );
    return reply.code(201).send({ recentSearch: place });
  });

  fastify.get('/recent-searches', {
    preHandler: fastify.authenticate,
    schema: ListRecentSearchesRouteSchema,
  }, async (request) => ({
    recentSearches: (await storageOperation(() =>
      fastify.supabase.listRecentSearches(
        request.accessToken as string,
        request.query.limit ?? 10,
      ),
    )).map(({ place, searchedAt }) => ({ ...place, searchedAt })),
  }));

  const clear = async (request: { accessToken: string | null }, reply: { code(statusCode: number): { send(): void } }) => {
    await storageOperation(() =>
      fastify.supabase.clearRecentSearches(request.accessToken as string),
    );
    reply.code(204).send();
  };
  const clearOptions = {
    preHandler: fastify.authenticate,
    schema: ClearRecentSearchesRouteSchema,
  };
  fastify.delete('/recent-searches', clearOptions, clear);
  fastify.delete('/all-recent-searches', clearOptions, clear);

  done();
};

export default recentSearchesRoutes;
