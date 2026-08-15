# NaviPet Backend

Fastify API foundation for NaviPet indoor campus navigation. Supabase Auth is
the only identity provider; Flutter sends its Supabase access token as a bearer
credential.

## Architecture

`src/app.ts` composes the injectable Fastify application. `src/server.ts` owns
environment loading, listening, and graceful shutdown. Feature modules own
their routes and schemas. Supabase access is separated into public,
user-scoped/RLS-aware, and optional admin clients.

## Requirements

- Node.js 22 or newer
- npm 11 or newer
- A Supabase project

## Local setup

```bash
cd backend
cp .env.example .env
npm install
```

Fill the required Supabase values in `backend/.env`. Never copy a service-role
key into the repository-root Flutter `.env`; Flutter bundles that file into the
mobile application.

## Environment variables

Required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_ISSUER`, and
`SUPABASE_JWT_AUDIENCE`.

Optional: `SUPABASE_SERVICE_ROLE_KEY`, `MULTISET_API_KEY`,
`MULTISET_API_BASE_URL`, and `CORS_ORIGINS`. Runtime, logging, payload, rate
limit, and docs defaults are documented in `.env.example`.

## Run

```bash
npm run dev
```

Production build:

```bash
npm run build
npm start
```

## Verification

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Health and API documentation

- `GET /health`
- `GET /api/v1/health`
- `/docs/` when `DOCS_ENABLED=true`
- `/docs/json` for the generated OpenAPI document

Health endpoints report process liveness and do not contact Supabase or
MultiSet.

## Authentication flow

1. Flutter signs in through Supabase Auth, including anonymous sign-in when
   selected.
2. Flutter sends `Authorization: Bearer <supabase-access-token>` to a protected
   Fastify route.
3. Fastify verifies Supabase claims, issuer, audience, expiry, and user ID.
4. Protected handlers read the trusted identity from `request.user`.

Fastify stores no passwords and never trusts a client-provided user ID.

## Supabase trust model

Normal user data access uses a Supabase client carrying the verified user's
token, preserving Row Level Security. The optional service-role client is a
separate server-only capability and is not attached to requests or used for
JWT verification.

## Current milestone boundary

This foundation contains health, security, authentication middleware, OpenAPI,
and test infrastructure. Database migrations, profiles, building/floor/POI
APIs, navigation, favorites, guide content, and MultiSet network integration
arrive in later controlled milestones.
