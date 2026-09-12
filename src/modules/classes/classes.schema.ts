import Type from 'typebox';

import { ErrorResponseSchema } from '../../common/errors/error-response.schema.js';

const UuidSchema = Type.String({
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
});

const ClassFieldsSchema = {
  courseCode: Type.String({ minLength: 1, maxLength: 30, example: 'CECS 491A' }),
  courseName: Type.String({ minLength: 1, maxLength: 100, example: 'Software Engineering Project' }),
  building: Type.String({
    minLength: 1,
    maxLength: 100,
    example: 'VEC',
    description:
      'A CSULB building name or code (e.g. "VEC" or "Vivian Engineering Center") is resolved against the ' +
      'campus dataset. Anything else (a street address, another campus, an off-campus site) is forward-geocoded ' +
      'with Mapbox instead. Either way the response echoes back a resolved display name plus latitude/longitude.',
  }),
  room: Type.Optional(Type.String({ maxLength: 100, example: '3-3' })),
  weekdays: Type.Array(Type.Integer({ minimum: 1, maximum: 7 }), {
    maxItems: 7,
    example: [1, 3, 5],
    description: 'ISO weekdays the class meets: 1 = Monday ... 7 = Sunday.',
  }),
  startTime: Type.String({
    pattern: '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$',
    example: '11:00',
    description: '24-hour local time, "HH:MM" or "HH:MM:SS".',
  }),
  endTime: Type.String({
    pattern: '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$',
    example: '12:15',
    description: '24-hour local time, "HH:MM" or "HH:MM:SS". Must be later than `startTime`.',
  }),
};

const ClassResponseSchema = Type.Object(
  {
    id: UuidSchema,
    ...ClassFieldsSchema,
    room: Type.String(),
    createdAt: Type.String(),
    updatedAt: Type.String(),
  },
  {
    $id: 'ClassResponse',
    additionalProperties: false,
    description: 'The stored class, with `building` resolved to its canonical display name.',
  },
);

const ClassIdParamsSchema = Type.Object({ classId: UuidSchema }, { additionalProperties: false });

const commonErrors = {
  401: ErrorResponseSchema('Authentication is required.'),
  422: ErrorResponseSchema('Request input failed validation.'),
  429: ErrorResponseSchema('Too many requests.'),
  502: ErrorResponseSchema('Class storage is unavailable.'),
};

export const ListClassesRouteSchema = {
  tags: ['Classes'], summary: 'List the authenticated user classes', security: [{ bearerAuth: [] }],
  description:
    'Requires a bearer access token from `POST /auth/login`.\n\n' +
    'Use the `access_token` field from that response. The Swagger "Authorize" button above sends it as ' +
    'the Authorization header for every request on this page.\n\n' +
    'Returns every class on the authenticated user schedule, most-recently-created last.',
  response: {
    200: Type.Object(
      { classes: Type.Array(ClassResponseSchema) },
      { description: "The authenticated user's classes." },
    ),
    ...commonErrors,
  },
};

export const CreateClassRouteSchema = {
  tags: ['Classes'], summary: 'Add a class to the authenticated user schedule', security: [{ bearerAuth: [] }],
  description:
    'Adds one class. Use the example request body below as a starting point — it already resolves.\n\n' +
    '`building` accepts either a CSULB building name or code (resolved against the campus dataset) or a plain ' +
    'address (forward-geocoded with Mapbox). Either way the stored class gets a resolved display name plus ' +
    'latitude/longitude, used later for class-aware navigation.\n\n' +
    '`weekdays`, `startTime`, and `endTime` are validated but not otherwise interpreted server-side.\n\n' +
    'A request where the end time is not later than the start time returns 422.',
  body: Type.Object(ClassFieldsSchema, { additionalProperties: false }),
  response: {
    201: Type.Object(
      { class: ClassResponseSchema },
      { description: 'The class was created.' },
    ),
    404: ErrorResponseSchema('Building or address not found.'),
    ...commonErrors,
  },
};

export const UpdateClassRouteSchema = {
  tags: ['Classes'], summary: 'Update one authenticated user class', security: [{ bearerAuth: [] }],
  description:
    'Partial update: send only the fields being changed. An empty body returns 422.\n\n' +
    'Omitting `building` leaves the stored coordinates untouched.\n\n' +
    'Sending `building` re-resolves the coordinates the same way `POST /classes` does.\n\n' +
    'Sending both `startTime` and `endTime` together validates that the end time is later than the start time. ' +
    'Changing only one of them is not cross-checked against the class\'s stored value for the other.',
  params: ClassIdParamsSchema,
  body: Type.Partial(Type.Object(ClassFieldsSchema, { additionalProperties: false })),
  response: {
    200: Type.Object(
      { class: ClassResponseSchema },
      { description: 'The class was updated.' },
    ),
    404: ErrorResponseSchema('Class not found, or building/address not found.'),
    ...commonErrors,
  },
};

export const DeleteClassRouteSchema = {
  tags: ['Classes'], summary: 'Delete one authenticated user class', security: [{ bearerAuth: [] }],
  params: ClassIdParamsSchema,
  response: { 204: { description: 'Class deleted. No response body.' }, 404: ErrorResponseSchema('Class not found.'), ...commonErrors },
};
