import Type from 'typebox';

import { ErrorResponseSchema } from '../../common/errors/error-response.schema.js';
import { ProfileRoleSchema } from '../profiles/profiles.schema.js';

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
  description:
    'Signs in an existing, confirmed account and returns a session.\n\n' +
    'Public — no bearer token is needed. The email is trimmed and ' +
    'lowercased before it is checked.\n\n' +
    '---\n\n' +
    'Send the returned `access_token` as ' +
    '`Authorization: Bearer <access_token>` on every protected route.\n\n' +
    '---\n\n' +
    'Keep `refresh_token` for `POST /auth/refresh` once the access token ' +
    'expires.\n\n' +
    'A newly registered account cannot sign in until its emailed code ' +
    'has been confirmed through `POST /auth/verify-otp`.',
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
    role: ProfileRoleSchema,
  },
  { additionalProperties: false },
);

export const RegisterResponseSchema = Type.Object(
  {
    message: Type.Literal('Verification code sent. Check your inbox.'),
    otp_required: Type.Literal(true),
  },
  {
    $id: 'RegisterResponse',
    description:
      'Registration accepted. Supabase requires email confirmation, so no ' +
      'session or tokens are issued until the user submits the ' +
      'verification code emailed to them to POST /auth/verify-otp ' +
      "(type: 'register').",
  },
);

export const RegisterRouteSchema = {
  tags: ['Authentication'],
  summary: 'Register with first name, last name, email, password, and role',
  description:
    'Creates an unconfirmed account and emails it a 6-digit verification ' +
    'code.\n\n' +
    'Public — no bearer token is needed. This call never returns access ' +
    'or refresh tokens.\n\n' +
    'Names and email are trimmed, and the email is lowercased, before ' +
    'validation.\n\n' +
    'The password needs 8 to 128 characters with at least one digit and ' +
    'one special character.\n\n' +
    '`role` is required and must be `student` or `professor`. It is ' +
    'self-declared: it is stored on the profile, can be changed later with ' +
    '`PATCH /profiles/me`, and is not an authorization signal.\n\n' +
    '---\n\n' +
    'Next step: submit the emailed code to `POST /auth/verify-otp` with ' +
    '`type: "register"`. That call confirms the account and signs it in.',
  body: RegisterBodySchema,
  response: {
    200: RegisterResponseSchema,
    400: ErrorResponseSchema('Malformed JSON body.'),
    409: ErrorResponseSchema('The normalized email is already registered.'),
    422: ErrorResponseSchema(
      'firstName/lastName/email/password/role failed validation, either ' +
        'schema validation (e.g. blank name, malformed email, password ' +
        'missing a digit or special character, missing or unknown role) ' +
        'or a Supabase-side check (e.g. weak_password).',
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
  description:
    'Exchanges a refresh token for a new access/refresh pair.\n\n' +
    'Public — no bearer token is needed. Call it once the current access ' +
    'token expires.\n\n' +
    'The response replaces both tokens. The submitted `refreshToken` is ' +
    'consumed and cannot be used again.\n\n' +
    'Reusing an already-consumed refresh token returns 401 and revokes ' +
    'its entire token family, so always retry with the newest token.\n\n' +
    'A recovery session from `POST /auth/verify-otp` cannot be refreshed ' +
    'and also returns 401.',
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
  description:
    'Signs out the session that the bearer access token belongs to.\n\n' +
    'Requires `Authorization: Bearer <access_token>`. Takes no request ' +
    'body.\n\n' +
    'Only that session is revoked — the same user stays signed in on ' +
    'other devices. Use `POST /auth/logout-all` to end every session.\n\n' +
    'To test: sign in, paste `access_token` into the "Authorize" button ' +
    'in Swagger UI, then execute.\n\n' +
    'A repeat call for an already-revoked session still returns 204.',
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
  description:
    'Signs the authenticated user out everywhere.\n\n' +
    'Requires `Authorization: Bearer <access_token>`. Takes no request ' +
    'body.\n\n' +
    'Unlike `POST /auth/logout`, this revokes every session the user has ' +
    'on every device.\n\n' +
    'Afterwards no previously issued token pair works; the user must ' +
    'sign in again with `POST /auth/login`.',
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
  description:
    'Returns the account that the bearer access token belongs to.\n\n' +
    'Requires `Authorization: Bearer <access_token>`.\n\n' +
    'Use it to check that a token still works and to read the account ' +
    'id, email, status, and creation time.\n\n' +
    'A bad or expired token returns 401. A valid token returns 403 when ' +
    'the account has been disabled and 404 when it has been deleted.',
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
    message: Type.Literal('Verification code sent. Check your inbox.'),
  },
  {
    $id: 'ForgotPasswordResponse',
    description: 'A matching account was found and a verification code was sent.',
  },
);

export const ForgotPasswordRouteSchema = {
  tags: ['Authentication'],
  summary: 'Request a password reset verification code by email',
  description:
    'First step of password recovery: emails a 6-digit verification code ' +
    'to an existing account.\n\n' +
    'Public — no bearer token is needed. The email is trimmed and ' +
    'lowercased before the lookup.\n\n' +
    'An email with no account returns 404. This is a deliberate product ' +
    'choice; `POST /auth/login` hides whether an account exists.\n\n' +
    '---\n\n' +
    'Next step: submit the emailed code to `POST /auth/verify-otp` with ' +
    '`type: "recovery"`.',
  body: ForgotPasswordBodySchema,
  response: {
    200: ForgotPasswordResponseSchema,
    400: ErrorResponseSchema('Malformed JSON body.'),
    404: ErrorResponseSchema('No account exists for this email.'),
    422: ErrorResponseSchema('Please enter a valid email address.'),
    429: ErrorResponseSchema('Too many password reset requests.'),
    502: ErrorResponseSchema('Supabase is unavailable.'),
    503: ErrorResponseSchema(
      'Password reset is unavailable (Supabase admin credentials not ' +
        'configured).',
    ),
  },
};

export const VerifyOtpBodySchema = Type.Object(
  {
    email: Type.String({
      minLength: 1,
      pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
      example: 'student@example.com',
    }),
    code: Type.String({ pattern: '^[0-9]{6}$', example: '123456' }),
    type: Type.Union([
      Type.Literal('recovery'),
      Type.Literal('register'),
      Type.Literal('email_change'),
    ], {
      description:
        "'recovery' verifies a password reset code (from " +
        "/auth/forgot-password); 'register' verifies an email confirmation " +
        "code (from /auth/register); 'email_change' verifies the code sent " +
        'to a new address (from /auth/change-email).',
    }),
  },
  {
    additionalProperties: false,
    'x-examples': {
      recovery: {
        summary: 'Password reset (type: recovery)',
        description: 'Code sent by POST /auth/forgot-password.',
        value: { email: 'student@example.com', code: '123456', type: 'recovery' },
      },
      register: {
        summary: 'Signup confirmation (type: register)',
        description: 'Code sent by POST /auth/register.',
        value: { email: 'student@example.com', code: '123456', type: 'register' },
      },
      email_change: {
        summary: 'Confirm email change (type: email_change)',
        description:
          'Code sent to the new address by POST /auth/change-email. `email` is the new address.',
        value: { email: 'new-email@example.com', code: '123456', type: 'email_change' },
      },
    },
  },
);

export const VerifyOtpSessionResponseSchema = Type.Object(
  {
    access_token: Type.String({ minLength: 1 }),
    refresh_token: Type.String({ minLength: 1 }),
    message: Type.Optional(
      Type.String({
        description:
          'Present only for type: email_change. Tells the user which email ' +
          'to use at the next sign-in.',
        example: 'Email updated. Use this email the next time you sign in.',
      }),
    ),
  },
  {
    $id: 'VerifyOtpSessionResponse',
    description:
      'A session for the verified account. For type: recovery this is a ' +
      'short-lived recovery session — send the access_token as a bearer ' +
      'credential to POST /auth/reset-password to set a new password. For ' +
      'type: register this is a normal login session — the account is now ' +
      'confirmed and signed in. For type: email_change this is a normal ' +
      'login session whose email claim is the new address — replace the ' +
      'stored tokens with it.',
  },
);

export const VerifyOtpRouteSchema = {
  tags: ['Authentication'],
  summary: 'Verify a one-time code for password reset, signup, or email change',
  description:
    'Confirms an emailed 6-digit code and returns a session. One ' +
    'endpoint serves three flows, selected by `type`.\n\n' +
    'Public — no bearer token is needed. Use the "Examples" dropdown on ' +
    'the request body below to load a sample payload for any flow.\n\n' +
    '---\n\n' +
    '### Password reset — `type: "recovery"`\n\n' +
    '**Step 1.** `POST /auth/forgot-password` with `{ "email" }`.\n\n' +
    '**Step 2.** Read the 6-digit code from that inbox.\n\n' +
    '**Step 3.** `POST /auth/verify-otp` with ' +
    '`{ "email", "code", "type": "recovery" }`.\n\n' +
    '**Step 4.** Use the returned `access_token` as the Bearer credential ' +
    'on `POST /auth/reset-password`.\n\n' +
    'This is a recovery session: it works only for the password reset. ' +
    'Other protected routes reject it with 401, and it cannot be ' +
    'refreshed.\n\n' +
    '---\n\n' +
    '### Signup email confirmation — `type: "register"`\n\n' +
    '**Step 1.** `POST /auth/register` with the new account details.\n\n' +
    '**Step 2.** Read the 6-digit code from that inbox.\n\n' +
    '**Step 3.** `POST /auth/verify-otp` with ' +
    '`{ "email", "code", "type": "register" }`.\n\n' +
    '**Step 4.** The account is now confirmed and the returned tokens are ' +
    'a normal session. No separate `POST /auth/login` call is needed.\n\n' +
    '---\n\n' +
    '### Confirm an email change — `type: "email_change"`\n\n' +
    '**Step 1.** `POST /auth/change-email` with the new address and the ' +
    'current bearer token.\n\n' +
    '**Step 2.** Read the 6-digit code sent to the new address.\n\n' +
    '**Step 3.** Call this endpoint with the new address as `email`, the ' +
    'code, and `"type": "email_change"`.\n\n' +
    '**Step 4.** The sign-in email is now the new address. Replace the ' +
    'stored tokens with the returned session so the token carries the new ' +
    'email.\n\n' +
    '**Step 5.** Show the returned message to the user: the new address ' +
    'is the one to sign in with from now on.\n\n' +
    '---\n\n' +
    'A wrong code and an expired code return the same 401 in every flow, ' +
    'so the response never reveals whether a code was ever valid.',
  body: VerifyOtpBodySchema,
  response: {
    200: VerifyOtpSessionResponseSchema,
    400: ErrorResponseSchema('Malformed JSON body.'),
    401: ErrorResponseSchema(
      'The code is missing, incorrect, or expired. The same response is ' +
        'used for both cases so it cannot be used to discover a valid code.',
    ),
    422: ErrorResponseSchema('Email, code, or type failed validation.'),
    429: ErrorResponseSchema('Too many verification attempts.'),
    502: ErrorResponseSchema('Supabase is unavailable.'),
  },
};

export const ChangeEmailBodySchema = Type.Object(
  {
    email: Type.String({
      minLength: 1,
      pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
      example: 'new-email@example.com',
    }),
  },
  { additionalProperties: false },
);

export const ChangeEmailResponseSchema = Type.Object(
  { status: Type.Literal('verification_required') },
  {
    $id: 'ChangeEmailResponse',
    description:
      'The request was accepted. If the address can be used, a 6-digit ' +
      'code is on its way to it.',
  },
);

// POST /auth/change-email
//   202 accepted — also returned when the address belongs to another account
//   400 malformed JSON (automatic)
//   401 INVALID_ACCESS_TOKEN — no/invalid/expired/non-standard bearer token
//   401 REAUTH_REQUIRED — no password sign-in on this session in the last 10 min
//   422 malformed email, or same as the current email
//   429 route limit, or Supabase's own email send limit
//   502 Supabase failed unexpectedly
export const ChangeEmailRouteSchema = {
  tags: ['Authentication'],
  summary: 'Send a confirmation code to change the sign-in email',
  description:
    'Starts an email-address change for the authenticated user.\n\n' +
    'Requires `Authorization: Bearer <access_token>` from a session that ' +
    'signed in with a password in the last 10 minutes.\n\n' +
    'An older session gets a 401 with code `REAUTH_REQUIRED`. Call ' +
    '`POST /auth/login` again and retry with the new token.\n\n' +
    '---\n\n' +
    'The email is trimmed and lowercased. A 6-digit code is sent to the new ' +
    'address only.\n\n' +
    'The response is the same 202 whether or not the address already ' +
    'belongs to another account, so it cannot be used to look up accounts.\n\n' +
    '---\n\n' +
    'Next step: submit the code through `POST /auth/verify-otp` with the ' +
    'new address as `email` and `type: "email_change"`.',
  security: [{ bearerAuth: [] }],
  body: ChangeEmailBodySchema,
  response: {
    202: ChangeEmailResponseSchema,
    400: ErrorResponseSchema('Malformed JSON body.'),
    401: ErrorResponseSchema(
      'Access token is missing, invalid, or expired (`INVALID_ACCESS_TOKEN`), ' +
        'or the session has no recent password sign-in (`REAUTH_REQUIRED`).',
    ),
    422: ErrorResponseSchema(
      'The new email is malformed or matches the current email.',
    ),
    429: ErrorResponseSchema('Too many email-change requests.'),
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
  description:
    'Last step of password recovery: sets a new password.\n\n' +
    'Requires a recovery `access_token` as the Bearer credential. A ' +
    'normal login token is rejected with 401.\n\n' +
    '---\n\n' +
    'To test: call `POST /auth/forgot-password`, then ' +
    '`POST /auth/verify-otp` with `type: "recovery"`.\n\n' +
    '---\n\n' +
    'Paste the `access_token` from that response into the "Authorize" ' +
    'button, then send matching `newPassword` and `confirmPassword`.\n\n' +
    '---\n\n' +
    'The password needs 8 to 128 characters with at least one uppercase ' +
    'letter and one digit, and must differ from the previous one.\n\n' +
    'A successful reset signs the user out everywhere, including this ' +
    'recovery session. Sign in again with `POST /auth/login`.',
  security: [{ bearerAuth: [] }],
  body: ResetPasswordBodySchema,
  response: {
    204: {
      description:
        'Password changed. No response body. The recovery session used ' +
        "for this request and the user's other active sessions are " +
        'revoked.',
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
  },
};
