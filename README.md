# NaviPet Backend

## Project purpose

NaviPet Backend is the TypeScript API for the NaviPet indoor/outdoor campus navigation
application. It provides the trusted server boundary between the Flutter client
and Supabase for authenticated user features such as profiles, class schedules,
task progress, and future navigation data.

The service does not manage passwords or create a separate identity system.
Supabase Auth owns user identity, while this backend validates access tokens,
applies application rules, and performs normal user data access under Supabase
Row Level Security (RLS).

## Architecture

The backend uses Fastify and separates runtime concerns from application
features:

- `src/server.ts` loads the environment, starts the HTTP server, and handles
  graceful shutdown.
- `src/app.ts` creates the Fastify application and registers infrastructure and
  feature plugins.
- `src/config/` validates runtime configuration before the server accepts
  traffic.
- `src/plugins/` owns authentication, Supabase clients, CORS, rate limiting,
  error handling, and API documentation infrastructure.
- `src/modules/` contains feature routes and their schemas.
- `src/common/` contains shared application errors and error codes.
- `supabase/schema.sql` defines application tables, triggers, constraints,
  indexes, and RLS policies.

Dependencies flow inward through Fastify decorators and explicit interfaces.
Routes consume validated configuration, authenticated identity, and scoped
Supabase resources without constructing those dependencies themselves. The
application can therefore be built in isolation for automated tests without
starting a network listener.

## Local API testing with Swagger UI

Use Node.js 22 or newer and npm 11 or newer. From the repository root, install
the dependencies and create a local environment file:

```bash
npm ci
cp .env.example .env
```

Set the following values in `.env` for your Supabase project:

```env
DOCS_ENABLED=true
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<publishable-or-anon-key>
SUPABASE_JWT_ISSUER=https://<project-ref>.supabase.co/auth/v1
SUPABASE_JWT_AUDIENCE=authenticated
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
```

The publishable key belongs in `SUPABASE_ANON_KEY`. `SUPABASE_SERVICE_ROLE_KEY`
is required by server-only administrative operations, including password-reset
session revocation and profile avatar uploads. Copy it from Supabase Dashboard →
Project Settings → API → the service-role secret. Never expose it to a client
or commit it to source control.

Start the development server:

```bash
npm run dev
```

Open <http://127.0.0.1:3000/docs/> to view the available operations. Use **Download OpenAPI JSON** to save the two-space-formatted specification; the download is also available at `/docs/openapi.json`. Select an
operation, choose **Try it out**, enter any required parameters, and choose
**Execute**.

For a protected route, first obtain a Supabase access token by signing in
through the Flutter client or Supabase Auth. Choose **Authorize** in Swagger UI
and paste the raw access token without adding the `Bearer` prefix; Swagger UI
adds that prefix to the request. Select **Authorize**, close the dialog, and
execute the protected operation.

Use <http://127.0.0.1:3000/health> to confirm that the backend is running. Press
`Ctrl+C` in the terminal to stop the server.

## Authentication

Supabase Auth is the only identity provider.

1. The Flutter client signs in through Supabase Auth. Anonymous Supabase users
   are supported.
2. Supabase returns an access token to the client.
3. The client sends that token as `Authorization: Bearer <access-token>` when
   calling a protected backend route.
4. The authentication plugin parses the bearer token and requests its claims
   through the Supabase public client.
5. The backend validates the subject UUID, issuer, audience, and expiration.
6. A successful check stores the trusted user identity and original access
   token on the Fastify request for protected handlers.

Password-recovery sessions are purpose-scoped. Apply the SQL migrations in
order—[`20260904`](supabase/migrations/20260904_add_recovery_session_purpose_hook.sql),
[`20260905`](supabase/migrations/20260905_classify_recovery_otp_sessions.sql),
then [`20260906`](supabase/migrations/20260906_persist_standard_otp_sessions.sql)—in
the Supabase SQL Editor, then configure `public.custom_access_token_hook` as
**Authentication > Hooks > Custom Access Token Hook**. The backend records a
short-lived recovery intent after it sends a reset email; the hook consumes that
intent when it issues the OTP session and adds a signed `session_purpose` claim.
Ordinary API routes require `standard`, while only `POST /auth/reset-password`
accepts `recovery`. The server rejects refresh for non-standard sessions and
revokes the recovery session after a successful password change.

After `POST /auth/verify-otp` successfully verifies an `email_change` code, the
backend sends a plain receipt to the new address through Resend. Set the
server-only `RESEND_API_KEY` in Render to enable delivery, and ensure
`noreply@navipet.me` is an approved Resend sender. The receipt contains no
verification link; the existing six-digit Supabase email completes the change.
If receipt delivery fails or the key is absent, the route logs the problem and
still returns the new session because the verification code has been consumed.

`POST /auth/register` requires `role`: `student` or `professor`. The backend
passes it to Supabase as sign-up metadata, and the `handle_new_user` trigger
copies it to `profiles.role` (any other value is stored as `null`). Role is
self-declared and can be changed later with `PATCH /profiles/me`, so never use
it for authorization.

Missing, malformed, expired, or otherwise invalid credentials return a generic
`401 Authentication required` response. The backend never accepts a user ID
from request data as proof of identity.

## Indoor door import (VEC)

`public.vec_destination_points` stores VEC room door positions in the MultiSet
MapSet frame (`MSET_XTBY7AM7ZK77`, origin = `Floor 1 2` map root, left-handed,
+Y up, metres). The [floor-three migration](supabase/migrations/20261117205322_add_vec_floor3_points.sql)
adds the floor-three rooms and doors alongside the existing lower-floor data.
After applying the migration, use the [read-only SQL checks](supabase/tests/vec_floor3_checks.sql).

Supply the path to a complete Unity export in the MultiSet MapSet frame using
[contract v2](scripts/lib/vec-points-import.ts). Include the floor-three doors.
The legacy export covering only floors 1–2 is stale for the expanded MapSet.

```bash
npm run vec-points:dry-run -- --file="/path/to/complete-vec-mapset-export.json"
npm run vec-points:apply -- --file="/path/to/complete-vec-mapset-export.json"
```

Without `--file`, both commands look for a local export at `data/vec-points.json`.

The dry-run prints planned inserts, updates, deactivations, unmatched doors
(no active VEC room row) and floor mismatches. Both commands require a matched
door for every active VEC room with a stored door in the MapSet, including rooms
whose stored doors are inactive. They reject multiple matched doors for any
room. If missing coverage blocks the plan, the error includes any floor
mismatches. Apply also rejects floor mismatches shown in the dry-run. It sets
`active = false` on doors in the same MapSet whose version differs from the
export or whose key is omitted from the matched doors.

The API takes a VEC room's `navigation.indoorDestinationId` from its active
door point. Place detail includes the indoor pose when the door has a heading.
Do not set `multiset_destination_id` for VEC rooms in `data/csulb-campus-places.csv`.

## Supabase security

The Supabase integration separates capabilities by trust level:

- The public client uses the publishable/anonymous key for public operations
  and token-claim verification.
- A user-scoped client forwards the verified access token to Supabase so
  database operations execute as that user and remain subject to RLS.
- The optional admin client uses the service-role key only for explicit
  server-side administrative work. It is not used for normal user requests or
  token verification.

Supabase Auth stores credentials. Application tables reference
`auth.users` by UUID and store only application-owned data. RLS policies in
`supabase/schema.sql` restrict profiles, classes, and task completions to their
owners. Foreign keys, checks, and triggers enforce ownership and data integrity
inside the database.

The service-role key must remain server-only and must never be included in the
Flutter application, committed to source control, or exposed to clients.
Sensitive request headers and configured secrets are redacted from backend
logs.

## Elbee campus assistant

`POST /elbee/ask` answers a CSULB building, room, next-class, or parking-rules question for the verified user. Cards carry a campus `placeId` and no coordinates. The client taps a card and uses the existing navigation flow. This route does not start navigation, write the schedule, or fetch arbitrary URLs.

The live model stays off unless every one of these is set on the server: `ELBEE_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `ELBEE_MODEL` (`claude-haiku-5-5` or `claude-sonnet-5-5`), `ELBEE_GLOBAL_DAILY_MICROS` and `ELBEE_USER_DAILY_MICROS` (user cap at or below the global cap), `SUPABASE_SERVICE_ROLE_KEY`, and the migration `supabase/migrations/20261110080000_elbee_budget.sql` applied to that project. This repository does not apply that migration and does not spend API credit. Missing any item keeps `provider` at `disabled` and answers from campus search. A configured key alone does not promise a later call is free.

Each provider call reserves its worst-case price (published global token prices times 1.1) against the Los Angeles daily caps before the call. Question text, schedule rows, token counts, and precise location are not written to logs. Budget reservations store no assistant response or schedule content. If a reservation cannot be finalized, it stays pending, consumes that day's cap, and its request ID remains unavailable; there is no automatic recovery. Parking copy is dated 2026-11-10, source-cited, and not permission to park. Contradictory official lists are not merged. There is no indoor route graph and no step-free route.

The key stays in the server environment. Do not put it in the client, logs, or this repository.

## Indoor AR token exchange

`POST /indoor/ar-token` requires the same standard Supabase bearer session as
campus routes. It takes no body and returns only `{ token, expiresOn }`, with
`expiresOn` an ISO 8601 timestamp and `Cache-Control: no-store`. Swagger documents
this contract; Flutter must refresh its OpenAPI snapshot in its separate PR.

Set **MULTISET_CLIENT_ID** and **MULTISET_CLIENT_SECRET** on the backend (Render).
Use credentials with only the **Query** scope: the token inherits their scope.
Never ship either credential in Flutter, Unity, or an APK. The legacy
`MULTISET_API_KEY` and `MULTISET_API_BASE_URL` slots are unused by this endpoint;
exchanges use the fixed HTTPS MultiSet endpoint and reject redirects.

Without either credential, the endpoint returns HTTP 503 with
`error.code = INDOOR_AR_UNAVAILABLE`. Upstream failures return HTTP 502 using the
standard safe error envelope. Requests are limited to five per verified user per
minute. The service reuses a process-local token while more than five minutes
remain and shares concurrent exchanges. Restarts and multiple replicas each need
their own token; this is not a durable lifetime quota counter. Failed exchanges
are not retried automatically.

MultiSet documents a 30-minute lifetime and Query permission for localization:
[credentials](https://docs.multiset.ai/fundamentals/credentials) and
[authentication](https://docs.multiset.ai/fundamentals/rest-api-docs/authentication).
Its [CORS guide](https://docs.multiset.ai/fundamentals/credentials/configuring-allowed-domains-cors)
describes browser origins, without specifying rejection of native requests that
have no Origin header. Verify this on a phone during Unity integration. The SDK
docs describe internal exchange/refresh using credentials; accepting a supplied
token and renewing it belongs to that later integration. This backend never
receives or localizes camera frames.

## Pet gems and costumes

All endpoints require a standard `Authorization: Bearer <access-token>` session.
Gems use the existing points wallet, kept in sync with `profiles.gems` (the larger value wins on migration; clients cannot write `profiles.gems` directly). The user is derived from the token.

- `GET /pet/gems` returns `balance`, `equippedOutfit` (or `null`), and `ownedOutfits`.
- `GET /pet/costumes` returns `costumes`, each with `id`, `name`, `price`, `assetReference`, and `owned`. The catalogue is seeded with the four legacy outfits (`csulb_tee`, `grad_cap`, `shades`, `beach_hat`); the owner loads further costumes later.
- `POST /pet/costumes/buy` accepts `{ "outfitId": "...", "equip": true }`. `equip` is optional and defaults to `false`. Price comes from the catalogue. A repeated purchase is successful without another charge; `equip: true` equips in the same transaction. The response contains `balance` and `equippedOutfit`.
- `POST /pet/costumes/equip` accepts `{ "outfitId": "..." }` for an owned outfit and returns `balance` and `equippedOutfit`.

A purchase with insufficient gems returns HTTP 409, error code `INSUFFICIENT_GEMS`, and `error.shortfall` with the number of additional gems needed. Unknown costumes and attempts to equip unowned outfits return 404. Apply the migration before using these endpoints; costume assets and catalogue seeding are separate follow-ups. The legacy `buy_outfit` RPC also uses the catalogue, which keeps the original four outfits and prices.

### Daily login reward

`POST /pet/rewards/daily-login` takes no body and returns `{ "balance": <int>, "earned": <int> }`. The first call of each America/Los_Angeles day earns 5 gems (`earned: 5`); a repeat call that day, or a call when the shared daily cap has no room, returns the current balance with `earned: 0` and writes nothing. Daily login and class-task rewards share one 50-gem cap per Los Angeles day (the cap in `claim_daily_task` now counts both), so a login can use gems that class tasks would otherwise earn. Apply `supabase/migrations/20261116000000_daily_login_reward.sql` first; `supabase/tests/daily_login_checks.sql` is a disposable-database check.

### Navigation rewards (disabled)

`POST /pet/rewards/navigation/start` (`{ destinationId, latitude, longitude }`) and `POST /pet/rewards/navigation/finish` (`{ tripId, latitude, longitude }`) require the standard bearer session and validate their bodies (latitude -90..90, longitude -180..180, unknown fields rejected), then always return HTTP 501 with `error.code = NAVIGATION_REWARD_UNAVAILABLE`. They issue no `tripId`, store nothing, never log coordinates, never call the database, and never credit gems. Reason: the proposed 20-gem completed-navigation reward (under the same shared 50-gem Los Angeles day cap) cannot be paid safely yet, because arrival verification, radius and check-in rules are deliberately deferred and coordinates sent by the client cannot prove arrival. Flutter treats the failed `start` as "no trip" and never calls `finish`. Enabling payout needs an approved arrival rule, a trip table, and a reward RPC; no client-controlled bypass exists meanwhile. The Flutter PR is untouched.
