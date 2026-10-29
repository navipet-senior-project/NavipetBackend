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
  Type.Literal('housing'),
  Type.Literal('landmark'),
  Type.Literal('external'),
]);

const OutdoorDestinationSchema = Type.Object(
  { latitude: Type.Number(), longitude: Type.Number() },
  { additionalProperties: false },
);

const BuildingFootprintSchema = Type.Object(
  {
    type: Type.Literal('Polygon'),
    coordinates: Type.Array(
      Type.Array(Type.Tuple([Type.Number(), Type.Number()]), {
        minItems: 4,
      }),
      { minItems: 1, maxItems: 1 },
    ),
  },
  {
    additionalProperties: false,
    description:
      'GeoJSON Polygon outer ring of the building, as closed ' +
      '[longitude, latitude] positions. Arrival is detected near this ' +
      'outline instead of the outdoor destination point.',
  },
);

const IndoorDoorPoseSchema = Type.Object(
  {
    mapCode: Type.String({ minLength: 1 }),
    frame: Type.Literal('multiset-mapset'),
    doorKey: Type.String({ minLength: 1 }),
    floor: Type.String({ minLength: 1 }),
    position: Type.Object(
      { x: Type.Number(), y: Type.Number(), z: Type.Number() },
      { additionalProperties: false },
    ),
    headingDeg: Type.Number({ minimum: 0, exclusiveMaximum: 360 }),
  },
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
    distanceMeters: Type.Optional(Type.Integer({ minimum: 0 })),
    indoor: Type.Optional(IndoorDoorPoseSchema),
    navigation: Type.Optional(
      Type.Object(
        {
          outdoorDestination: Type.Optional(OutdoorDestinationSchema),
          arrivalRadiusMeters: Type.Optional(
            Type.Integer({ minimum: 3, maximum: 50 }),
          ),
          footprint: Type.Optional(BuildingFootprintSchema),
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
    latitude: Type.Optional(Type.Number({ minimum: -90, maximum: 90 })),
    longitude: Type.Optional(Type.Number({ minimum: -180, maximum: 180 })),
  },
  { additionalProperties: false },
);

export const AutocompleteResponseSchema = Type.Object(
  {
    query: Type.String(),
    results: Type.Array(PublicCampusResultSchema),
    proximity: Type.Optional(
      Type.Object(
        {
          intent: Type.Union([
            Type.Literal('restroom'),
            Type.Literal('food'),
            Type.Literal('parking'),
            Type.Literal('bus_stop'),
            Type.Literal('coffee'),
          ]),
          status: Type.Literal('ok'),
          radiusMeters: Type.Integer({ minimum: 1 }),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { $id: 'CampusAutocompleteResponse', additionalProperties: false },
);

export const AutocompleteRouteSchema = {
  tags: ['Campus'],
  summary: 'Autocomplete campus destinations',
  description:
    'Searches active, searchable CSULB campus destinations that match ' +
    '`q`.\n\n' +
    'Requires `Authorization: Bearer <access_token>`.\n\n' +
    '`q` must contain at least two meaningful characters, otherwise the ' +
    'request returns 422.\n\n' +
    '`limit` defaults to 10 and is capped at 20.\n\n' +
    '`latitude` and `longitude` are optional but must be sent together.\n\n' +
    '---\n\n' +
    '### Proximity search\n\n' +
    'These phrases search for the nearest matching places instead of ' +
    'matching by name: "nearest restroom", "food near me", ' +
    '"nearest parking", "closest bus stop", "coffee near me".\n\n' +
    'They require `latitude` and `longitude`; without them the request ' +
    'returns 422.\n\n' +
    '---\n\n' +
    'Only places within 2000 meters are returned, each with ' +
    '`distanceMeters`, and the response gains a `proximity` object.\n\n' +
    '---\n\n' +
    '### Mapbox fallback\n\n' +
    'When an ordinary search finds no campus destination with outdoor ' +
    'coordinates, a temporary Mapbox result may be returned instead. ' +
    'Proximity searches never do this.\n\n' +
    'A Mapbox result has `external: true` and an `id` starting with ' +
    '`mapbox:`.\n\n' +
    '---\n\n' +
    'It is not stored, so that `id` cannot be used with ' +
    '`GET /places/{placeId}` or `POST /recent-searches`.',
  security: [{ bearerAuth: [] }],
  querystring: SearchQuerySchema,
  response: {
    200: AutocompleteResponseSchema,
    401: ErrorResponseSchema('Access token is missing, invalid, or expired.'),
    422: ErrorResponseSchema('Query, limit, or location failed validation.'),
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
  description:
    'Returns one active, searchable campus destination by its UUID.\n\n' +
    'Requires `Authorization: Bearer <access_token>`.\n\n' +
    '`placeId` is the `id` of a campus result from `GET /autocomplete`.\n\n' +
    '---\n\n' +
    'A well-formed UUID with no matching active, searchable destination ' +
    'returns 404.\n\n' +
    'A temporary Mapbox result has a `mapbox:` prefixed `id`, which is ' +
    'not a UUID and returns 422.\n\n' +
    '---\n\n' +
    'For those, use the coordinates already present on the autocomplete ' +
    'result.',
  security: [{ bearerAuth: [] }],
  params: PlaceParamsSchema,
  response: {
    200: PlaceResponseSchema,
    401: ErrorResponseSchema('Access token is missing, invalid, or expired.'),
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
  description:
    'Searches the rooms inside one building, best match for `q` first.\n\n' +
    'Requires `Authorization: Bearer <access_token>`.\n\n' +
    '`buildingCode` is the campus building code, for example "ECS". It ' +
    'is matched case-insensitively.\n\n' +
    '---\n\n' +
    '`q` must contain at least two meaningful characters. Whitespace ' +
    'inside it is ignored, so "101" and "1 01" match the same rooms.\n\n' +
    '`limit` defaults to 10 and is capped at 20.\n\n' +
    'Only active, searchable rooms are returned — never buildings, ' +
    'entrances, or other destination types.\n\n' +
    'A building code that does not resolve to an active, searchable ' +
    'building returns 404.\n\n' +
    '`latitude` and `longitude` are accepted but ignored here.',
  security: [{ bearerAuth: [] }],
  params: RoomsParamsSchema,
  querystring: SearchQuerySchema,
  response: {
    200: RoomsResponseSchema,
    401: ErrorResponseSchema('Access token is missing, invalid, or expired.'),
    404: ErrorResponseSchema('The active, searchable building does not exist.'),
    422: ErrorResponseSchema('Building code, room query, or limit failed validation.'),
    429: ErrorResponseSchema('Too many requests.'),
    502: ErrorResponseSchema('Supabase is unavailable.'),
  },
};
