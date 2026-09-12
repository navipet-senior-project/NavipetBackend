import Type from 'typebox';

import { ErrorResponseSchema } from '../../common/errors/error-response.schema.js';

const UuidSchema = Type.String({
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
});

const ClassFieldsSchema = {
  courseCode: Type.String({ minLength: 1, maxLength: 30 }),
  courseName: Type.String({ minLength: 1, maxLength: 100 }),
  building: Type.String({ minLength: 1, maxLength: 100 }),
  room: Type.Optional(Type.String({ maxLength: 100 })),
  weekdays: Type.Array(Type.Integer({ minimum: 1, maximum: 7 }), { maxItems: 7 }),
  startTime: Type.String({ pattern: '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' }),
};

const ClassResponseSchema = Type.Object({
  id: UuidSchema,
  ...ClassFieldsSchema,
  room: Type.String(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
}, { additionalProperties: false });

const ClassIdParamsSchema = Type.Object({ classId: UuidSchema }, { additionalProperties: false });

const commonErrors = {
  401: ErrorResponseSchema('Authentication is required.'),
  422: ErrorResponseSchema('Request input failed validation.'),
  429: ErrorResponseSchema('Too many requests.'),
  502: ErrorResponseSchema('Class storage is unavailable.'),
};

export const ListClassesRouteSchema = {
  tags: ['Classes'], summary: 'List the authenticated user classes', security: [{ bearerAuth: [] }],
  response: { 200: Type.Object({ classes: Type.Array(ClassResponseSchema) }), ...commonErrors },
};

export const CreateClassRouteSchema = {
  tags: ['Classes'], summary: 'Add a class to the authenticated user schedule', security: [{ bearerAuth: [] }],
  body: Type.Object(ClassFieldsSchema, { additionalProperties: false }),
  response: { 201: Type.Object({ class: ClassResponseSchema }), 404: ErrorResponseSchema('Building or address not found.'), ...commonErrors },
};

export const UpdateClassRouteSchema = {
  tags: ['Classes'], summary: 'Update one authenticated user class', security: [{ bearerAuth: [] }],
  params: ClassIdParamsSchema,
  body: Type.Partial(Type.Object(ClassFieldsSchema, { additionalProperties: false })),
  response: { 200: Type.Object({ class: ClassResponseSchema }), 404: ErrorResponseSchema('Class not found, or building/address not found.'), ...commonErrors },
};

export const DeleteClassRouteSchema = {
  tags: ['Classes'], summary: 'Delete one authenticated user class', security: [{ bearerAuth: [] }],
  params: ClassIdParamsSchema,
  response: { 204: { description: 'Class deleted. No response body.' }, 404: ErrorResponseSchema('Class not found.'), ...commonErrors },
};
