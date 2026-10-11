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
    avatarUploadId: Type.Optional(Type.String({
      format: 'uuid',
      description:
        'The uploadId returned by POST /profiles/me/avatar. Supplying it ' +
        'commits that temporary avatar when the profile is saved.',
    })),
  },
  { additionalProperties: false, minProperties: 1 },
);

export const UploadAvatarResponseSchema = Type.Object({
  uploadId: Type.String({ format: 'uuid' }),
  avatarUrl: Type.String({ format: 'uri' }),
});

export const UploadAvatarRouteSchema = {
  tags: ['Profiles'],
  summary: 'Upload a temporary profile avatar',
  description:
    'Uploads one image as a temporary avatar. It is not the saved ' +
    'profile avatar until it is committed.\n\n' +
    'Requires `Authorization: Bearer <access_token>`.\n\n' +
    'Send `multipart/form-data` with the file in a field named ' +
    '`avatar`.\n\n' +
    'Accepted formats are JPEG, PNG, and WebP, up to 5 MB.\n\n' +
    '---\n\n' +
    '**To keep it:** send the returned `uploadId` as `avatarUploadId` in ' +
    '`PATCH /profiles/me`.\n\n' +
    '---\n\n' +
    '**To discard it:** call `DELETE /profiles/me/avatar/{uploadId}`.\n\n' +
    '---\n\n' +
    'The returned `avatarUrl` is a preview link that expires after about ' +
    'one hour.',
  security: [{ bearerAuth: [] }],
  consumes: ['multipart/form-data'],
  body: {
    type: 'object',
    required: ['avatar'],
    properties: {
      avatar: { type: 'string', format: 'binary', description: 'Avatar image file.' },
    },
  },
  response: {
    200: UploadAvatarResponseSchema,
    400: ErrorResponseSchema(
      'The multipart body is malformed, has no file, or does not use the ' +
      '`avatar` field.',
    ),
    401: ErrorResponseSchema('Access token is missing, invalid, or expired.'),
    413: ErrorResponseSchema('The image is larger than 5 MB.'),
    415: ErrorResponseSchema(
      'The request is not multipart/form-data, or the file is not a JPEG, ' +
      'PNG, or WebP image.',
    ),
    502: ErrorResponseSchema('Profile storage is unavailable.'),
    503: ErrorResponseSchema('Avatar storage is not configured on the server.'),
  },
};

export const DeleteAvatarRouteSchema = {
  tags: ['Profiles'],
  summary: 'Discard a temporary profile avatar upload',
  description:
    'Discards a temporary avatar upload, for when the user cancels their ' +
    'profile changes.\n\n' +
    'Requires `Authorization: Bearer <access_token>`.\n\n' +
    '`uploadId` is the value returned by `POST /profiles/me/avatar`.\n\n' +
    'Do not call this after that `uploadId` has been committed through ' +
    '`PATCH /profiles/me`.\n\n' +
    'An upload that does not exist for this user returns 404.',
  security: [{ bearerAuth: [] }],
  params: Type.Object({ uploadId: Type.String({ format: 'uuid' }) }),
  response: {
    204: { description: 'Temporary avatar deleted.' },
    401: ErrorResponseSchema('Access token is missing, invalid, or expired.'),
    404: ErrorResponseSchema('Temporary avatar not found.'),
    422: ErrorResponseSchema('The uploadId is not a UUID.'),
    502: ErrorResponseSchema('Profile storage is unavailable.'),
    503: ErrorResponseSchema('Avatar storage is not configured on the server.'),
  },
};

export const UpdateProfileRouteSchema = {
  tags: ['Profiles'],
  summary: 'Update the authenticated user profile',
  description:
    'Updates the profile of the authenticated user and returns the saved ' +
    'profile.\n\n' +
    'Requires `Authorization: Bearer <access_token>`.\n\n' +
    'Send at least one field. Omitted fields keep their current values.\n\n' +
    '`displayName` is trimmed and cannot be blank. To change the email, ' +
    'use `POST /auth/change-email`; email is deliberately not editable ' +
    'through this endpoint.\n\n' +
    '---\n\n' +
    'To save a new avatar, first call `POST /profiles/me/avatar`, then ' +
    'send its `uploadId` here as `avatarUploadId`.\n\n' +
    '---\n\n' +
    'The returned `avatarUrl` is a temporary signed URL that expires ' +
    'after about one hour.\n\n' +
    'In Swagger UI, delete the fields you do not want to change from the ' +
    'example body before executing.',
  security: [{ bearerAuth: [] }],
  body: UpdateProfileBodySchema,
  response: {
    200: GetProfileResponseSchema,
    400: ErrorResponseSchema('Malformed JSON body.'),
    401: ErrorResponseSchema('Access token is missing, invalid, or expired.'),
    404: ErrorResponseSchema(
      'The authenticated profile, or the avatar upload named by ' +
      '`avatarUploadId`, does not exist.',
    ),
    422: ErrorResponseSchema('The request body failed validation.'),
    502: ErrorResponseSchema('Profile storage is unavailable.'),
    503: ErrorResponseSchema('Avatar storage is not configured on the server.'),
  },
};
