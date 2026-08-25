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
```

The publishable key belongs in `SUPABASE_ANON_KEY`. Leave
`SUPABASE_SERVICE_ROLE_KEY` empty unless you are explicitly testing an
administrative server operation.

Start the development server:

```bash
npm run dev
```

Open <http://127.0.0.1:3000/docs/> to view the available operations. Select an
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
