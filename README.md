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

Missing, malformed, expired, or otherwise invalid credentials return a generic
`401 Authentication required` response. The backend never accepts a user ID
from request data as proof of identity.

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
