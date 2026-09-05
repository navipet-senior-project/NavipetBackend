import type { FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';

import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { createCampusService, normalizeCampusQuery } from './campus.service.js';
import {
  AutocompleteRouteSchema,
  PlaceRouteSchema,
  RoomsRouteSchema,
} from './campus.schema.js';

function requireMeaningfulQuery(query: string): void {
  if (normalizeCampusQuery(query).meaningfulLength < 2) {
    throw new AppError({
      code: ErrorCode.VALIDATION_ERROR,
      statusCode: 422,
      message: 'Query must contain at least two meaningful characters.',
    });
  }
}

function requireCoordinatePair(
  latitude: number | undefined,
  longitude: number | undefined,
): void {
  if ((latitude === undefined) !== (longitude === undefined)) {
    throw new AppError({
      code: ErrorCode.VALIDATION_ERROR,
      statusCode: 422,
      message: 'Latitude and longitude must be provided together.',
    });
  }
}

const campusRoutes: FastifyPluginCallbackTypebox = (fastify, _options, done) => {
  const service = createCampusService({
    campusPlaces: fastify.supabase,
    externalPlaces: fastify.externalPlaces,
  });

  fastify.get(
    '/autocomplete',
    { schema: AutocompleteRouteSchema },
    async (request) => {
      requireMeaningfulQuery(request.query.q);
      requireCoordinatePair(request.query.latitude, request.query.longitude);
      try {
        return await service.autocomplete(
          request.query.q,
          request.query.limit ?? 10,
          request.query.latitude === undefined || request.query.longitude === undefined
            ? undefined
            : {
                latitude: request.query.latitude,
                longitude: request.query.longitude,
              },
        );
      } catch (cause) {
        if (cause instanceof AppError) throw cause;
        throw new AppError({
          code: ErrorCode.UPSTREAM_ERROR,
          statusCode: 502,
          message: 'Campus search unavailable',
          cause,
        });
      }
    },
  );

  fastify.get(
    '/places/:placeId',
    { schema: PlaceRouteSchema },
    async (request) => {
      let place;
      try {
        place = await service.findPlace(request.params.placeId);
      } catch (cause) {
        throw new AppError({
          code: ErrorCode.UPSTREAM_ERROR,
          statusCode: 502,
          message: 'Campus place lookup unavailable',
          cause,
        });
      }
      if (place === null) {
        throw new AppError({
          code: ErrorCode.NOT_FOUND,
          statusCode: 404,
          message: 'Campus place not found',
        });
      }
      return { place };
    },
  );

  fastify.get(
    '/buildings/:buildingCode/rooms',
    { schema: RoomsRouteSchema },
    async (request) => {
      requireMeaningfulQuery(request.query.q);
      let result;
      try {
        result = await service.searchRooms(
          request.params.buildingCode,
          request.query.q,
          request.query.limit ?? 10,
        );
      } catch (cause) {
        throw new AppError({
          code: ErrorCode.UPSTREAM_ERROR,
          statusCode: 502,
          message: 'Campus room search unavailable',
          cause,
        });
      }
      if (result === null) {
        throw new AppError({
          code: ErrorCode.NOT_FOUND,
          statusCode: 404,
          message: 'Campus building not found',
        });
      }
      return result;
    },
  );

  done();
};

export default campusRoutes;
