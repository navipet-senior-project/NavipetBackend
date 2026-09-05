import Type from 'typebox';

import { ErrorResponseSchema } from '../../common/errors/error-response.schema.js';

const DestinationTypeSchema = Type.Union([
  Type.Literal('building'),
  Type.Literal('room'),
  Type.Literal('entrance'),
  Type.Literal('parking'),
  Type.Literal('dining'),
  Type.Literal('service'),
  Type.Literal('amenity'),
  Type.Literal('transit'),
  Type.Literal('landmark'),
  Type.Literal('external'),
]);

const OutdoorDestinationSchema = Type.Object(
  { latitude: Type.Number(), longitude: Type.Number() },
  { additionalProperties: false },
);

export const PublicCampusResultSchema = Type.Object(
  {
    id: Type.String(),
    type: DestinationTypeSchema,
    title: Type.String(),
    subtitle: Type.String(),
    source: Type.String(),
    buildingCode: Type.Optional(Type.String()),
    roomNumber: Type.Optional(Type.String()),
    floorNumber: Type.Optional(Type.String()),
    external: Type.Optional(Type.Literal(true)),
    attribution: Type.Optional(Type.String()),
    navigation: Type.Optional(
      Type.Object(
        {
          outdoorDestination: Type.Optional(OutdoorDestinationSchema),
          indoorDestinationId: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

const SearchQuerySchema = Type.Object(
  {
    q: Type.String({ minLength: 1, maxLength: 256 }),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
  },
  { additionalProperties: false },
);

export const AutocompleteResponseSchema = Type.Object(
  {
    query: Type.String(),
    results: Type.Array(PublicCampusResultSchema),
  },
  { $id: 'CampusAutocompleteResponse', additionalProperties: false },
);

export const AutocompleteRouteSchema = {
  tags: ['Campus'],
  summary: 'Autocomplete campus destinations',
  description:
    'Searches active, searchable CSULB destinations first. A temporary Mapbox result may be returned only when local search has no result.',
  querystring: SearchQuerySchema,
  response: {
    200: AutocompleteResponseSchema,
    422: ErrorResponseSchema('Query or limit failed validation.'),
    429: ErrorResponseSchema('Too many requests.'),
    502: ErrorResponseSchema('A required search provider is unavailable.'),
  },
};

const PlaceParamsSchema = Type.Object(
  {
    placeId: Type.String({
      pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
    }),
  },
  { additionalProperties: false },
);

export const PlaceResponseSchema = Type.Object(
  { place: PublicCampusResultSchema },
  { $id: 'CampusPlaceResponse', additionalProperties: false },
);

export const PlaceRouteSchema = {
  tags: ['Campus'],
  summary: 'Get one campus destination',
  params: PlaceParamsSchema,
  response: {
    200: PlaceResponseSchema,
    404: ErrorResponseSchema('The active, searchable destination does not exist.'),
    422: ErrorResponseSchema('Place ID failed validation.'),
    429: ErrorResponseSchema('Too many requests.'),
    502: ErrorResponseSchema('Supabase is unavailable.'),
  },
};

const RoomsParamsSchema = Type.Object(
  { buildingCode: Type.String({ minLength: 1, maxLength: 80 }) },
  { additionalProperties: false },
);

const RoomsResponseSchema = Type.Object(
  {
    building: Type.Object(
      { id: Type.String(), code: Type.String(), name: Type.String() },
      { additionalProperties: false },
    ),
    query: Type.String(),
    results: Type.Array(PublicCampusResultSchema),
  },
  { $id: 'CampusRoomsResponse', additionalProperties: false },
);

export const RoomsRouteSchema = {
  tags: ['Campus'],
  summary: 'Search verified rooms in a building',
  params: RoomsParamsSchema,
  querystring: SearchQuerySchema,
  response: {
    200: RoomsResponseSchema,
    404: ErrorResponseSchema('The active, searchable building does not exist.'),
    422: ErrorResponseSchema('Building code, room query, or limit failed validation.'),
    429: ErrorResponseSchema('Too many requests.'),
    502: ErrorResponseSchema('Supabase is unavailable.'),
  },
};
