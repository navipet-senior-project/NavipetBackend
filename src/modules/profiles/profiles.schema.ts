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
    'Requires `Authorization: Bearer <access_token>`. Returns the profile ' +
    'belonging to the authenticated user only.',
  security: [{ bearerAuth: [] }],
  response: {
    200: GetProfileResponseSchema,
    401: ErrorResponseSchema('Access token is missing, invalid, or expired.'),
    404: ErrorResponseSchema('The authenticated profile does not exist.'),
    502: ErrorResponseSchema('Profile storage is unavailable.'),
  },
};
