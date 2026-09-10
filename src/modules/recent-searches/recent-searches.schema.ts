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
  description:
    'Records that the authenticated user picked a destination, so it can be replayed by GET /recent-searches. Send `{ "placeId": "<uuid>" }` using the `id` of a local autocomplete result; the place is re-resolved server-side and the stored copy comes from the database, not from the request. Saving a place that is already in the list refreshes its timestamp instead of creating a duplicate, so the same call is safe to repeat. Requires a bearer access token — the list is scoped to that user by RLS and cannot be read or written for anyone else. Temporary Mapbox results (`mapbox:` prefixed `id`) are not storable and fail validation with 422; a well-formed UUID with no matching destination returns 404.',
  security: [{ bearerAuth: [] }],
  body: PlaceIdSchema,
  response: { 201: RecentSearchResponseSchema, 404: ErrorResponseSchema('Campus place not found.'), ...commonErrors },
};

export const ListRecentSearchesRouteSchema = {
  tags: ['Recent searches'],
  summary: 'Get recent selected campus places',
  description:
    "Returns the authenticated user's saved places, most recently searched first, each carrying an ISO-8601 `searchedAt` timestamp alongside the place fields. `limit` defaults to 10 and is capped at 20. Requires a bearer access token; RLS scopes the result to that user, and a user with no history gets an empty array rather than a 404.",
  security: [{ bearerAuth: [] }],
  querystring: RecentSearchesQuerySchema,
  response: { 200: RecentSearchesResponseSchema, ...commonErrors },
};

export const ClearRecentSearchesRouteSchema = {
  tags: ['Recent searches'],
  summary: 'Clear all recent selected campus places',
  description:
    "Deletes every recent search belonging to the authenticated user. There is no per-entry delete and no request body. Responds 204 with an empty body, and is idempotent — clearing an already-empty history also returns 204. Requires a bearer access token; RLS confines the delete to that user's rows. `DELETE /all-recent-searches` is an alias that behaves identically.",
  security: [{ bearerAuth: [] }],
  response: {
    204: { description: 'Recent searches cleared. No response body.' },
    ...commonErrors,
  },
};
