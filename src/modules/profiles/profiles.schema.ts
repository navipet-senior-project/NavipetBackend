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
      avatarUrl: Type.Union([Type.String({ format: 'uri' }), Type.Null()], {
        description:
          'Temporary signed avatar URL, valid for about one hour. `null` when ' +
          'the avatar cannot be served; show a local placeholder instead.',
      }),
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
    'Returns the display name, email, role, and avatar of the ' +
    'authenticated user, as shown on the profile screen.\n\n' +
    'Requires `Authorization: Bearer <access_token>`.\n\n' +
    '`avatarUrl` is a temporary signed URL that expires after about one ' +
    'hour, so fetch the profile again rather than caching the URL.\n\n' +
    '`avatarUrl` is `null` when no avatar can be served; show a local ' +
    'placeholder instead.',
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
    role: Type.Optional(ProfileRoleSchema),
    avatar: Type.Optional(Type.String({
      format: 'binary',
      description: 'Optional JPEG, PNG, or WebP file, up to 5 MB.',
    })),
  },
  { additionalProperties: false, minProperties: 1 },
);

export const UpdateProfileRouteSchema = {
  tags: ['Profiles'],
  summary: 'Update the authenticated user profile',
  description:
    'Updates the profile of the authenticated user and returns the saved ' +
    'profile.\n\n' +
    'Requires `Authorization: Bearer <access_token>`.\n\n' +
    'Send at least one field. Omitted fields keep their current values. ' +
    'Use JSON when changing text fields only. Use multipart form data when ' +
    'including an avatar file; send text fields as ordinary form fields and ' +
    'the image in a field named `avatar`.\n\n' +
    '`displayName` is trimmed and cannot be blank. To change the email, ' +
    'use `POST /auth/change-email`; email is deliberately not editable ' +
    'through this endpoint.\n\n' +
    'Avatar images must be JPEG, PNG, or WebP and no larger than 5 MB. ' +
    'The server stores a newly selected avatar only when this request saves ' +
    'successfully.\n\n' +
    'The returned `avatarUrl` is a temporary signed URL that expires ' +
    'after about one hour.\n\n' +
    'In Swagger UI, delete the fields you do not want to change from the ' +
    'example body before executing.',
  security: [{ bearerAuth: [] }],
  body: UpdateProfileBodySchema,
  consumes: ['application/json', 'multipart/form-data'],
  response: {
    200: GetProfileResponseSchema,
    400: ErrorResponseSchema('Malformed JSON or multipart request.'),
    401: ErrorResponseSchema('Access token is missing, invalid, or expired.'),
    404: ErrorResponseSchema(
      'The authenticated profile does not exist.',
    ),
    413: ErrorResponseSchema('The image is larger than 5 MB.'),
    415: ErrorResponseSchema(
      'The request encoding or avatar image type is unsupported.',
    ),
    422: ErrorResponseSchema('The request body failed validation.'),
    502: ErrorResponseSchema('Profile storage is unavailable.'),
    503: ErrorResponseSchema('Avatar storage is not configured on the server.'),
  },
};
