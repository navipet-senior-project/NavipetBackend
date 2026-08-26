# Backend Registration with Mobile Email Confirmation

## Goal

Make the NaviPet Flutter app register users through `POST /auth/register`.
Supabase must create the Auth user and send its confirmation email. When the
user opens the confirmation link on a device with NaviPet installed, the link
must open the Flutter app, establish the Supabase session, and navigate the
authenticated user to the map.

## Scope

This change spans three systems:

- `NavipetBackend`: owns the public registration contract and calls Supabase
  Auth.
- `NaviPetFlutter`: submits registration to the backend and receives the Auth
  callback.
- Supabase Auth configuration: requires email confirmation and permits the
  NaviPet callback URL.

Password login, password reset, anonymous login, and existing authenticated
data access remain direct Flutter-to-Supabase flows. No service-role credential
is added to the mobile app.

## API Contract

`POST /auth/register` accepts:

```json
{
  "name": "Test User",
  "email": "user@example.com",
  "password": "a-secure-password"
}
```

Validation rules:

- `name` is required after trimming and is limited to 100 characters.
- `email` retains the existing syntactic email validation and is normalized by
  trimming and lowercasing.
- `password` retains the existing 12-to-128-character contract.

When Supabase accepts registration, the backend returns HTTP `200`:

```json
{
  "message": "Confirmation email sent. Check your inbox.",
  "confirmation_required": true
}
```

The backend never returns access or refresh tokens from registration. The
confirmation callback establishes the mobile session instead.

Existing error behavior remains:

- `409 EMAIL_ALREADY_EXISTS` when Supabase explicitly reports an existing
  account.
- `422 VALIDATION_ERROR` for invalid input or a Supabase validation failure.
- `429 RATE_LIMITED` for Fastify or Supabase registration/email rate limits.
- `500 INTERNAL_ERROR` for unexpected failures, without exposing upstream
  details.

Supabase can intentionally obscure duplicate-account results when email
confirmation is enabled. Such an accepted response remains the same generic
`200` response so callers cannot rely on registration to enumerate accounts.

## Backend Design

Add `AUTH_EMAIL_REDIRECT_URL` to validated backend configuration. Production
uses:

```text
navipet://auth-callback
```

The registration gateway gains signup-specific input instead of reusing the
login credential type. It forwards:

- normalized email and password;
- `data.display_name` from the trimmed `name`;
- `options.emailRedirectTo` from `AUTH_EMAIL_REDIRECT_URL`.

The route converts a successful Supabase signup into the fixed `200` response.
The gateway may still expose whether Supabase returned a session for internal
diagnostics and tests, but the route does not return those credentials.

`.env.example` documents the redirect URL, and `render.yaml` declares it as an
explicit environment value. The service fails startup validation when the URL
is missing or malformed, preventing confirmation emails with an unintended
redirect.

## Flutter Design

Add `BACKEND_BASE_URL` to Flutter configuration. Registration sends the name,
email, and password to `${BACKEND_BASE_URL}/auth/register` over HTTPS. The
existing Supabase Flutter client stays initialized because it owns the mobile
session, Auth event stream, and authenticated database access.

The sign-up result distinguishes confirmation-required success from backend
errors. The UI displays:

```text
Confirmation email sent. Open it on this device to finish signing in.
```

It remains on the sign-in screen until the callback produces a session.

Register the callback with both platforms:

- Android: an `ACTION_VIEW` intent filter for scheme `navipet` and host
  `auth-callback` on `MainActivity`.
- iOS: a `CFBundleURLTypes` entry for scheme `navipet`.

`supabase_flutter` deep-link detection remains enabled. On a callback that
contains Supabase session parameters, the SDK obtains and persists the session,
then emits `onAuthStateChange`. Existing `AppState` applies the user, and the
existing `GoRouter` refresh redirects authenticated users from `/signin` to
`/map`. No separate callback screen is required.

## Supabase Configuration

In Supabase Dashboard:

1. Keep **Confirm email** enabled for the email provider.
2. Add `navipet://auth-callback` to Authentication > URL Configuration >
   Redirect URLs.
3. Keep the confirmation template's button based on
   `{{ .ConfirmationURL }}` so Supabase verifies the token before redirecting
   to the requested callback.

The confirmation link must be opened on the same mobile device where NaviPet
is installed. A desktop browser cannot automatically open the app on another
device.

## Data Flow

1. Flutter validates required form fields and posts registration to the
   backend.
2. The backend validates and normalizes the request.
3. The backend calls Supabase Auth signup with user metadata and the NaviPet
   callback URL.
4. Supabase creates an unconfirmed `auth.users` record and sends the
   confirmation email.
5. The backend returns the generic `200` confirmation response.
6. The user taps the email link on the mobile device.
7. Supabase verifies the email and redirects to `navipet://auth-callback` with
   session parameters.
8. The operating system opens NaviPet.
9. `supabase_flutter` consumes and persists the session, then emits the Auth
   event.
10. `AppState` loads the user/profile and `GoRouter` navigates to `/map`.

## Security and Privacy

- Passwords travel only over HTTPS and are never logged or stored by the
  backend.
- The mobile app contains only the Supabase publishable key, never the service
  role key.
- Registration responses do not expose tokens.
- Backend logs retain existing password/header redaction and do not record the
  deep-link session fragment.
- The custom URL scheme is acceptable for the current project. A production
  hardening follow-up should replace it with verified iOS Universal Links and
  Android App Links on an owned HTTPS domain to prevent another installed app
  from claiming the scheme.

## Testing

Backend automated tests cover:

- required/trimmed name validation;
- metadata and redirect forwarding to the Supabase gateway;
- `200` confirmation response with no tokens;
- existing duplicate, validation, and both rate-limit branches;
- environment validation for the redirect URL.

Flutter automated tests cover:

- the exact backend request and success response mapping;
- backend validation/error response mapping;
- confirmation-required UI behavior;
- Auth state changing from signed out to signed in and router navigation to
  `/map`.

Manual integration verification uses a fresh disposable email:

1. Register from the Flutter app.
2. Confirm the backend returns `200` and the email arrives.
3. Open the email on the test device and tap the confirmation link.
4. Confirm NaviPet opens directly on the map as the registered user.
5. Confirm Supabase shows the same user with a populated confirmation time and
   `display_name` metadata.

## Delivery Order

1. Implement and deploy the backend contract and redirect configuration.
2. Configure the callback allowlist in Supabase.
3. Implement and test the Flutter backend gateway and platform deep links.
4. Run the disposable-email integration check on Android and iOS as available.

The mobile build must not ship before its backend URL and Supabase redirect
allowlist are configured.
