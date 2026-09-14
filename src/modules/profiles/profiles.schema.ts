import Type from 'typebox';

import { ErrorResponseSchema } from '../../common/errors/error-response.schema.js';

export const ProfileRoleSchema = Type.Union([
  Type.Literal('student'),
  Type.Literal('professor'),
]);

export const GetProfileResponseSchema = Type.Object(
  {
    profile: Type.Object({
      displayName: Type.String(),
      email: Type.Union([Type.String(), Type.Null()]),
      role: Type.Union([ProfileRoleSchema, Type.Null()]),
    }),
  },
  {
    $id: 'GetProfileResponse',
    description: 'The authenticated user profile used by the profile screen.',
  },
);

export const GetProfileRouteSchema = {
  tags: ['Profiles'],
  summary: 'Get the authenticated user profile',
  description:
    'Returns the display name, email, and role for the currently logged-in ' +
    'user. Requires `Authorization: Bearer <access_token>`.',
  security: [{ bearerAuth: [] }],
  response: {
    200: GetProfileResponseSchema,
    401: ErrorResponseSchema('Access token is missing, invalid, or expired.'),
    404: ErrorResponseSchema('The authenticated profile does not exist.'),
    502: ErrorResponseSchema('Profile storage is unavailable.'),
  },
};

export const UpdateProfileBodySchema = Type.Object(
  {
    displayName: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
    email: Type.Optional(Type.String({
      minLength: 1,
      pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
    })),
    role: Type.Optional(ProfileRoleSchema),
  },
  { additionalProperties: false, minProperties: 1 },
);

export const UpdateProfileRouteSchema = {
  tags: ['Profiles'],
  summary: 'Update the authenticated user profile',
  description:
    'Updates the display name, email, and/or role for the currently logged-in ' +
    'user. Requires `Authorization: Bearer <access_token>`. In Swagger, ' +
    'delete any JSON fields you do not want to change before executing. ' +
    'Omitted fields keep their existing values.',
  security: [{ bearerAuth: [] }],
  body: UpdateProfileBodySchema,
  response: {
    200: GetProfileResponseSchema,
    400: ErrorResponseSchema('Malformed JSON body.'),
    401: ErrorResponseSchema('Access token is missing, invalid, or expired.'),
    404: ErrorResponseSchema('The authenticated profile does not exist.'),
    422: ErrorResponseSchema('The display name is invalid.'),
    502: ErrorResponseSchema('Profile storage is unavailable.'),
  },
};
