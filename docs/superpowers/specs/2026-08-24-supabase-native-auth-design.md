# Supabase-native `/auth` endpoints — design

Source request: `fastify-supabase-auth-implementation-spec.md` (user-provided,
external doc, not checked into this repo). That spec asks for a hand-rolled
Prisma + Argon2id + locally-signed-JWT identity system. This conflicts with
`CLAUDE.md`: *"Supabase Auth is the only identity provider."* The design below
implements the same endpoint surface and status-code contract using Supabase
Auth (GoTrue) as the source of truth instead, per user decision.

## Scope

Extend the existing `src/modules/auth` module (currently only
`POST /auth/login`) with:

- `POST /auth/register`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/logout-all`
- `GET /auth/me`

No new database, no new tables, no Prisma. `auth.users` (Supabase-managed)
stays the only identity store. GoTrue already does password hashing,
refresh-token rotation, and reuse detection server-side.

## Endpoint → Supabase call mapping

| Endpoint | Supabase call | Auth required |
|---|---|---|
| `POST /auth/register` | `publicClient.auth.signUp({email, password})` | no |
| `POST /auth/login` | `signInWithPassword` (existing) | no |
| `POST /auth/refresh` | `client.auth.refreshSession({refresh_token})` | no |
| `POST /auth/logout` | `adminClient.auth.admin.signOut(accessToken, 'local')` | yes |
| `POST /auth/logout-all` | `adminClient.auth.admin.signOut(accessToken, 'global')` | yes |
| `GET /auth/me` | existing `authenticate` preHandler + `adminClient.auth.admin.getUserById(id)` | yes |

## Deviations from the literal spec

1. **`/auth/logout` takes `Authorization: Bearer <accessToken>`, not a
   `refreshToken` body.** Supabase's public API has no "revoke by raw refresh
   token" endpoint — that would let anyone probe token validity without a
   password. The only real revocation path is
   `admin.signOut(accessToken, scope)`. Logout becomes authenticated, like
   logout-all, scoped `local` instead of `global`.
2. **Logout/logout-all require `SUPABASE_SERVICE_ROLE_KEY`** (the
   `adminClient`). Already provisioned in `render.yaml` and `.env.example`,
   optional at the `EnvironmentSchema` level. These two routes return `503
   UPSTREAM_ERROR` with a server-side log if it's absent, rather than
   silently no-op.
3. **Token TTLs are Supabase project settings, not code.** The spec's
   `ACCESS_TOKEN_TTL_SECONDS`/`REFRESH_TOKEN_TTL_SECONDS` env vars don't
   apply. Operator must set these in the Supabase dashboard (Auth →
   Sessions) to 900s / 2,592,000s.
4. **Registration assumes "Confirm email" is OFF** in the Supabase project
   for immediate token issuance. If ON, `signUp` returns `session: null`.
   Both cases are handled explicitly: session present → `201` with full
   token envelope; session null → `201` with `user` only, no
   `accessToken`/`refreshToken` fields.
5. **400 vs 422 split, fixed globally in `error-handler.ts`.** Today both
   malformed JSON and schema-validation failures map to `400
   VALIDATION_ERROR`. Spec wants malformed JSON → `400 INVALID_JSON`,
   syntactically-valid-but-invalid-fields → `422 VALIDATION_ERROR`. This is a
   shared-infra correctness fix, not new scope, but it changes one existing
   assertion in `tests/integration/login.test.ts` ("rejects a missing
   password" moves from `400` to `422`).
6. **`/auth/login`'s existing response body is unchanged**
   (`access_token`/`refresh_token`, snake_case, no `user` field) to avoid
   breaking the Flutter client. New token-issuing endpoints (register,
   refresh) match that same shape rather than the spec's camelCase
   `accessToken`/`tokenType`/`expiresIn` shape, so all token responses stay
   internally consistent.
7. **`user_banned` maps to `403 ACCOUNT_DISABLED`,** pulled out of
   `signInWithPassword`'s `CredentialDenialCodes` (which currently
   anonymizes it into a `401`). Supabase only returns `user_banned` after
   password verification succeeds, so this doesn't introduce an enumeration
   vector.
8. **`GET /auth/me` also requires `adminClient`.** The JWT claims from
   `getClaims` only carry `sub`/`email`/`iss`/`aud`/`exp` — no `status` or
   `createdAt`. Those come from `adminClient.auth.admin.getUserById(id)`
   (`banned_until` present → `DISABLED`, absent → `ACTIVE`; `created_at` →
   `createdAt`). Same `503 UPSTREAM_ERROR` fallback as logout if the admin
   client is unavailable.

## Error codes (added to `ErrorCode` union)

`EMAIL_ALREADY_EXISTS`, `ACCOUNT_DISABLED`, `INVALID_CREDENTIALS`,
`INVALID_REFRESH_TOKEN`, `REFRESH_TOKEN_REUSED`, `INVALID_ACCESS_TOKEN`,
`USER_NOT_FOUND`, `INVALID_JSON`. Same envelope as today:
`{ error: { code, message, requestId } }`.

## Status code mapping (per endpoint)

### `POST /auth/register`
- `201` — user created (with tokens if session issued, without if email
  confirmation pending)
- `400 INVALID_JSON` — malformed JSON
- `409 EMAIL_ALREADY_EXISTS` — `email_exists` / `user_already_exists`
- `422 VALIDATION_ERROR` — invalid email/password shape, or Supabase
  `weak_password`/`validation_failed`
- `429 RATE_LIMITED`
- `500 INTERNAL_ERROR`

### `POST /auth/login` (existing, extended)
- `200` — unchanged
- `400 INVALID_JSON`
- `401 INVALID_CREDENTIALS` — unknown email, wrong password (identical body)
- `403 ACCOUNT_DISABLED` — `user_banned` with correct credentials
- `422 VALIDATION_ERROR`
- `429 RATE_LIMITED`
- `500 INTERNAL_ERROR`

### `POST /auth/refresh`
- `200` — rotated pair
- `400 INVALID_JSON`
- `401 INVALID_REFRESH_TOKEN` — `refresh_token_not_found` /
  `session_not_found` / `session_expired`
- `401 REFRESH_TOKEN_REUSED` — `refresh_token_already_used` (GoTrue already
  revokes the token family server-side on reuse)
- `422 VALIDATION_ERROR`
- `429 RATE_LIMITED`
- `500 INTERNAL_ERROR`

### `POST /auth/logout`
- `204` — always, for any syntactically valid request (idempotent, no
  enumeration)
- `400 INVALID_JSON`
- `401 INVALID_ACCESS_TOKEN` — missing/invalid/expired bearer token
- `429 RATE_LIMITED`
- `500 INTERNAL_ERROR` / `503 UPSTREAM_ERROR` if `adminClient` unavailable

### `POST /auth/logout-all`
- `204` — all sessions revoked
- `401 INVALID_ACCESS_TOKEN`
- `404 USER_NOT_FOUND` — token subject no longer exists
- `429 RATE_LIMITED`
- `500 INTERNAL_ERROR` / `503 UPSTREAM_ERROR`

### `GET /auth/me`
- `200` — `{ user: { id, email, status, createdAt } }` (no password/session
  data, ever)
- `401 INVALID_ACCESS_TOKEN`
- `403 ACCOUNT_DISABLED`
- `404 USER_NOT_FOUND`
- `500 INTERNAL_ERROR`

## Rate limiting

Per-route overrides via `@fastify/rate-limit`'s existing global registration
(`route.config.rateLimit`), values from new env vars:
`AUTH_LOGIN_RATE_LIMIT_MAX/WINDOW`, `AUTH_REGISTER_RATE_LIMIT_MAX/WINDOW`,
`AUTH_REFRESH_RATE_LIMIT_MAX/WINDOW`. Stricter than the global default for
login/refresh per spec.

## Testing

Same pattern as `login.test.ts`/`auth-guard.test.ts`: inject fake
`supabaseResources` (mocked `signUp`/`refreshSession`/`admin.signOut`/
`getClaims`) via `buildTestApp`, drive through `app.inject()`. No real
network, no real Supabase project. Covers every status row above plus:
email normalization, password never in response, concurrent-duplicate
register (both requests hit the mocked `signUp`, one path returns
`email_exists`), logout idempotency, logout-all not affecting other users'
sessions, redaction of `authorization`/tokens from logs.

## Files touched

**New:** register/refresh/logout/logout-all/me schemas + handlers in
`src/modules/auth/auth.schema.ts` and `auth.routes.ts`.

**Modified:**
- `src/plugins/supabase.ts` — add `signUp`, `refreshSession`, `adminSignOut`,
  `getUserById` (or equivalent) to `SupabaseResources`.
- `src/plugins/error-handler.ts` — split 400/422.
- `src/common/errors/error-codes.ts` — new codes.
- `src/config/env.ts` + `.env.example` + `render.yaml` — new rate-limit env
  vars.
- `tests/integration/login.test.ts` — one status-code assertion update.
- New integration test files for register/refresh/logout/logout-all/me.

## Out of scope

Prisma, new database tables/migrations, cookie-based transport, password
composition rules beyond length, any UI/client changes.
