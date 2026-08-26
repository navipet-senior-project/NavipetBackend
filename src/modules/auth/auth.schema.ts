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
    firstName: Type.String({
      minLength: 1,
      maxLength: 50,
      example: 'Elbee',
    }),
    lastName: Type.String({
      minLength: 1,
      maxLength: 50,
      example: 'Shark',
    }),
    email: Type.String({
      minLength: 1,
      pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
      example: 'student@example.com',
    }),
    password: Type.String({
      minLength: 8,
      maxLength: 128,
      pattern: '^(?=.*[0-9])(?=.*[^A-Za-z0-9]).*$',
      example: 'Password1!',
    }),
  },
  { additionalProperties: false },
);

export const RegisterResponseSchema = Type.Object(
  {
    message: Type.Literal('Confirmation email sent. Check your inbox.'),
    confirmation_required: Type.Literal(true),
  },
  {
    $id: 'RegisterResponse',
    description:
      'Registration accepted. Supabase requires email confirmation, so no ' +
      'session or tokens are issued until the user confirms via the link ' +
      'sent to their inbox.',
  },
);

export const RegisterRouteSchema = {
  tags: ['Authentication'],
  summary: 'Register with first name, last name, email, and password',
  description:
    'Never returns access or refresh tokens. The account remains ' +
    'unconfirmed until the user follows the confirmation link emailed to ' +
    'them.',
  body: RegisterBodySchema,
  response: {
    200: RegisterResponseSchema,
    400: ErrorResponseSchema('Malformed JSON body.'),
    409: ErrorResponseSchema('The normalized email is already registered.'),
    422: ErrorResponseSchema(
      'firstName/lastName/email/password failed validation, either ' +
        'schema validation (e.g. blank name, malformed email, password ' +
        'missing a digit or special character) or a Supabase-side check ' +
        '(e.g. weak_password).',
    ),
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

export const ForgotPasswordBodySchema = Type.Object(
  {
    email: Type.String({
      minLength: 1,
      pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
      example: 'student@example.com',
    }),
  },
  { additionalProperties: false },
);

export const ForgotPasswordResponseSchema = Type.Object(
  {
    message: Type.Literal(
      'If an account exists for this email, a verification code has been sent.',
    ),
  },
  {
    $id: 'ForgotPasswordResponse',
    description:
      'Always returned for a syntactically valid email, whether or not an ' +
      'account exists, so the response cannot be used to discover which ' +
      'accounts exist.',
  },
);

export const ForgotPasswordRouteSchema = {
  tags: ['Authentication'],
  summary: 'Request a password reset verification code by email',
  body: ForgotPasswordBodySchema,
  response: {
    200: ForgotPasswordResponseSchema,
    400: ErrorResponseSchema('Malformed JSON body.'),
    422: ErrorResponseSchema('Please enter a valid email address.'),
    429: ErrorResponseSchema('Too many password reset requests.'),
    502: ErrorResponseSchema('Supabase is unavailable.'),
  },
};

export const VerifyResetCodeBodySchema = Type.Object(
  {
    email: Type.String({
      minLength: 1,
      pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
      example: 'student@example.com',
    }),
    code: Type.String({ pattern: '^[0-9]{6}$', example: '123456' }),
  },
  { additionalProperties: false },
);

export const ResetSessionResponseSchema = Type.Object(
  {
    access_token: Type.String({ minLength: 1 }),
    refresh_token: Type.String({ minLength: 1 }),
  },
  {
    $id: 'ResetSessionResponse',
    description:
      'A short-lived recovery session. Send the access_token as a bearer ' +
      'credential to POST /auth/reset-password to set a new password.',
  },
);

export const VerifyResetCodeRouteSchema = {
  tags: ['Authentication'],
  summary: 'Verify a password reset code and obtain a recovery session',
  body: VerifyResetCodeBodySchema,
  response: {
    200: ResetSessionResponseSchema,
    400: ErrorResponseSchema('Malformed JSON body.'),
    401: ErrorResponseSchema(
      'The code is missing, incorrect, or expired. The same response is ' +
        'used for both cases so it cannot be used to discover a valid code.',
    ),
    422: ErrorResponseSchema('Email or code failed validation.'),
    429: ErrorResponseSchema('Too many verification attempts.'),
    502: ErrorResponseSchema('Supabase is unavailable.'),
  },
};

const NewPasswordSchema = Type.String({
  minLength: 8,
  maxLength: 128,
  pattern: '^(?=.*[A-Z])(?=.*[0-9]).{8,}$',
  example: 'Password1',
});

export const ResetPasswordBodySchema = Type.Object(
  {
    newPassword: NewPasswordSchema,
    confirmPassword: NewPasswordSchema,
  },
  { additionalProperties: false },
);

export const ResetPasswordRouteSchema = {
  tags: ['Authentication'],
  summary: 'Set a new password using a verified recovery session',
  security: [{ bearerAuth: [] }],
  body: ResetPasswordBodySchema,
  response: {
    204: {
      description:
        'Password reset. No response body. The recovery session used to ' +
        'authenticate this request remains valid; call /auth/login to ' +
        'obtain a fresh session as needed.',
    },
    400: ErrorResponseSchema('Malformed JSON body.'),
    401: ErrorResponseSchema(
      'The recovery access token is missing, invalid, or expired.',
    ),
    422: ErrorResponseSchema(
      'newPassword/confirmPassword failed validation, either schema ' +
        'validation (too short, missing an uppercase letter or a digit), ' +
        "a mismatch between the two fields, or a Supabase-side check " +
        '(e.g. the new password matches the previous one).',
    ),
    429: ErrorResponseSchema('Too many requests.'),
    500: ErrorResponseSchema('Unexpected failure while resetting the password.'),
    503: ErrorResponseSchema(
      'Password reset is unavailable (Supabase admin credentials not ' +
        'configured).',
    ),
  },
};
