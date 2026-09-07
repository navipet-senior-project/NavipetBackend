import Type from 'typebox';

import { ErrorResponseSchema } from '../../common/errors/error-response.schema.js';
import { PublicCampusResultSchema } from '../campus/campus.schema.js';

const PlaceIdSchema = Type.Object(
  {
    placeId: Type.String({
      pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
    }),
  },
  { additionalProperties: false },
);

const RecentSearchSchema = Type.Object(
  {
    ...PublicCampusResultSchema.properties,
    searchedAt: Type.String(),
  },
  { additionalProperties: false },
);

const RecentSearchResponseSchema = Type.Object({
  recentSearch: PublicCampusResultSchema,
});

const RecentSearchesResponseSchema = Type.Object({
  recentSearches: Type.Array(RecentSearchSchema),
});

const RecentSearchesQuerySchema = Type.Object(
  { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })) },
  { additionalProperties: false },
);

const commonErrors = {
  401: ErrorResponseSchema('Authentication is required.'),
  422: ErrorResponseSchema('Request input failed validation.'),
  429: ErrorResponseSchema('Too many requests.'),
  502: ErrorResponseSchema('Recent search storage is unavailable.'),
};

export const CreateRecentSearchRouteSchema = {
  tags: ['Recent searches'],
  summary: 'Save a selected campus place',
  security: [{ bearerAuth: [] }],
  body: PlaceIdSchema,
  response: { 201: RecentSearchResponseSchema, 404: ErrorResponseSchema('Campus place not found.'), ...commonErrors },
};

export const ListRecentSearchesRouteSchema = {
  tags: ['Recent searches'],
  summary: 'Get recent selected campus places',
  security: [{ bearerAuth: [] }],
  querystring: RecentSearchesQuerySchema,
  response: { 200: RecentSearchesResponseSchema, ...commonErrors },
};

export const ClearRecentSearchesRouteSchema = {
  tags: ['Recent searches'],
  summary: 'Clear all recent selected campus places',
  security: [{ bearerAuth: [] }],
  response: {
    204: { description: 'Recent searches cleared. No response body.' },
    ...commonErrors,
  },
};
