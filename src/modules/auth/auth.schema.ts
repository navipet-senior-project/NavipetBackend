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
  { $id: 'LoginResponse' },
);

export const LoginRouteSchema = {
  tags: ['Authentication'],
  summary: 'Sign in with email and password',
  body: LoginBodySchema,
  response: {
    200: LoginResponseSchema,
    400: ErrorResponseSchema,
    401: ErrorResponseSchema,
    403: ErrorResponseSchema,
    422: ErrorResponseSchema,
    429: ErrorResponseSchema,
    502: ErrorResponseSchema,
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
  { $id: 'TokenResponse' },
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
    400: ErrorResponseSchema,
    409: ErrorResponseSchema,
    422: ErrorResponseSchema,
    429: ErrorResponseSchema,
    500: ErrorResponseSchema,
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
    400: ErrorResponseSchema,
    401: ErrorResponseSchema,
    422: ErrorResponseSchema,
    429: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
};

export const LogoutRouteSchema = {
  tags: ['Authentication'],
  summary: 'Revoke the current session',
  security: [{ bearerAuth: [] }],
  response: {
    400: ErrorResponseSchema,
    401: ErrorResponseSchema,
    429: ErrorResponseSchema,
    500: ErrorResponseSchema,
    503: ErrorResponseSchema,
  },
};

export const LogoutAllRouteSchema = {
  tags: ['Authentication'],
  summary: 'Revoke every session for the authenticated user',
  security: [{ bearerAuth: [] }],
  response: {
    400: ErrorResponseSchema,
    401: ErrorResponseSchema,
    404: ErrorResponseSchema,
    429: ErrorResponseSchema,
    500: ErrorResponseSchema,
    503: ErrorResponseSchema,
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
  { $id: 'MeResponse' },
);

export const MeRouteSchema = {
  tags: ['Authentication'],
  summary: 'Get the authenticated user',
  security: [{ bearerAuth: [] }],
  response: {
    200: MeResponseSchema,
    401: ErrorResponseSchema,
    403: ErrorResponseSchema,
    404: ErrorResponseSchema,
    429: ErrorResponseSchema,
    500: ErrorResponseSchema,
    503: ErrorResponseSchema,
  },
};
