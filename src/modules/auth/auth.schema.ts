import Type from 'typebox';

import { ErrorResponseSchema } from '../../common/errors/error-response.schema.js';

export const LoginBodySchema = Type.Object(
  {
    email: Type.String({
      minLength: 1,
      pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
      example: 'student@example.com',
    }),
    password: Type.String({ minLength: 1, example: 'password' }),
  },
  { additionalProperties: false },
);

export const LoginResponseSchema = Type.Object(
  {
    access_token: Type.String({ minLength: 1 }),
    refresh_token: Type.String({ minLength: 1 }),
  },
  {
    $id: 'LoginResponse',
    description:
      'Tokens issued. Do not store the refresh token in browser localStorage.',
  },
);

export const LoginRouteSchema = {
  tags: ['Authentication'],
  summary: 'Sign in with email and password',
  body: LoginBodySchema,
  response: {
    200: LoginResponseSchema,
    400: ErrorResponseSchema('Malformed JSON body.'),
    401: ErrorResponseSchema(
      'Email or password is incorrect. Also returned for an unknown ' +
        'email, so the response cannot be used to discover which ' +
        'accounts exist.',
    ),
    403: ErrorResponseSchema(
      'Credentials were valid, but the account is disabled.',
    ),
    422: ErrorResponseSchema('Email or password failed validation.'),
    429: ErrorResponseSchema('Too many login attempts.'),
    502: ErrorResponseSchema('Supabase authentication is unavailable.'),
  },
};

export const RegisterBodySchema = Type.Object(
  {
    email: Type.String({
      minLength: 1,
      pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
      example: 'student@example.com',
    }),
    password: Type.String({
      minLength: 12,
      maxLength: 128,
      example: 'a-long-user-password',
    }),
  },
  { additionalProperties: false },
);

// Tokens are optional: if the Supabase project requires email
// confirmation, registration succeeds but no session is issued yet.
export const TokenResponseSchema = Type.Object(
  {
    access_token: Type.Optional(Type.String({ minLength: 1 })),
    refresh_token: Type.Optional(Type.String({ minLength: 1 })),
  },
  {
    $id: 'TokenResponse',
    description:
      'User created. Includes access and refresh tokens unless the ' +
      'Supabase project requires email confirmation, in which case ' +
      'both fields are omitted until the user confirms. Do not store ' +
      'the refresh token in browser localStorage.',
  },
);

export const RegisterRouteSchema = {
  tags: ['Authentication'],
  summary: 'Register with email and password',
  description:
    'Do not store the returned refresh token in browser localStorage. ' +
    'Clients are responsible for secure token storage.',
  body: RegisterBodySchema,
  response: {
    201: TokenResponseSchema,
    400: ErrorResponseSchema('Malformed JSON body.'),
    409: ErrorResponseSchema('The normalized email is already registered.'),
    422: ErrorResponseSchema('Email or password failed validation.'),
    429: ErrorResponseSchema('Too many registration attempts.'),
    500: ErrorResponseSchema(
      'Unexpected failure while creating the account.',
    ),
  },
};

export const RefreshBodySchema = Type.Object(
  { refreshToken: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);

export const RefreshRouteSchema = {
  tags: ['Authentication'],
  summary: 'Rotate a refresh token for a new access/refresh pair',
  body: RefreshBodySchema,
  response: {
    200: LoginResponseSchema,
    400: ErrorResponseSchema('Malformed JSON body.'),
    401: ErrorResponseSchema(
      'The refresh token is missing, unknown, expired, or was already ' +
        'used. Reuse of a consumed token revokes its entire token family.',
    ),
    422: ErrorResponseSchema('Request body failed validation.'),
    429: ErrorResponseSchema('Too many refresh attempts.'),
    500: ErrorResponseSchema('Unexpected failure while rotating the token.'),
  },
};

export const LogoutRouteSchema = {
  tags: ['Authentication'],
  summary: 'Revoke the current session',
  security: [{ bearerAuth: [] }],
  response: {
    204: {
      description:
        'Session revoked. No response body. Idempotent — also returned ' +
        'for an already-revoked or unknown session, so the response ' +
        'cannot be used to discover whether a token ever existed.',
    },
    400: ErrorResponseSchema('Malformed JSON body.'),
    401: ErrorResponseSchema('Access token is missing, invalid, or expired.'),
    429: ErrorResponseSchema('Too many requests.'),
    500: ErrorResponseSchema(
      'Unexpected failure while revoking the session.',
    ),
    503: ErrorResponseSchema(
      'Session revocation is unavailable (Supabase admin credentials ' +
        'not configured).',
    ),
  },
};

export const LogoutAllRouteSchema = {
  tags: ['Authentication'],
  summary: 'Revoke every session for the authenticated user',
  security: [{ bearerAuth: [] }],
  response: {
    204: {
      description:
        'Every refresh session belonging to the authenticated user is ' +
        'revoked. No response body. Sessions belonging to other users ' +
        'are never affected.',
    },
    400: ErrorResponseSchema('Malformed JSON body.'),
    401: ErrorResponseSchema('Access token is missing, invalid, or expired.'),
    404: ErrorResponseSchema('The authenticated user no longer exists.'),
    429: ErrorResponseSchema('Too many requests.'),
    500: ErrorResponseSchema('Unexpected failure while revoking sessions.'),
    503: ErrorResponseSchema(
      'Session revocation is unavailable (Supabase admin credentials ' +
        'not configured).',
    ),
  },
};

export const MeResponseSchema = Type.Object(
  {
    user: Type.Object({
      id: Type.String(),
      email: Type.String(),
      status: Type.Union([Type.Literal('ACTIVE'), Type.Literal('DISABLED')]),
      createdAt: Type.String(),
    }),
  },
  {
    $id: 'MeResponse',
    description:
      "The authenticated user's profile. Never includes a password hash " +
      'or session/token data.',
  },
);

export const MeRouteSchema = {
  tags: ['Authentication'],
  summary: 'Get the authenticated user',
  security: [{ bearerAuth: [] }],
  response: {
    200: MeResponseSchema,
    401: ErrorResponseSchema('Access token is missing, invalid, or expired.'),
    403: ErrorResponseSchema('The authenticated account is disabled.'),
    404: ErrorResponseSchema('The authenticated user no longer exists.'),
    429: ErrorResponseSchema('Too many requests.'),
    500: ErrorResponseSchema('Unexpected failure while loading the user.'),
    503: ErrorResponseSchema(
      'User lookup is unavailable (Supabase admin credentials not ' +
        'configured).',
    ),
  },
};
