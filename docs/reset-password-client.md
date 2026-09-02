# Password reset — what the Flutter client must do

Reference for [`Ben2104/NaviPetFlutter`](https://github.com/Ben2104/NaviPetFlutter).
Written after diagnosing the `Session from session_id claim in JWT does not
exist` error on the "Create a new password" screen.

## What was broken

The old backend changed the password with the Supabase **service-role admin**
API (`PUT /auth/v1/admin/users/{id}`). That call revokes **every** session for
the user, including the recovery session the client was holding. The very next
Supabase call the app made with that token failed:

```
Session from session_id claim in JWT does not exist   (403, session_not_found)
```

The password had actually been changed; only the follow-up call failed. The
backend now performs a **session-bound** update (`PUT /auth/v1/user` with the
recovery access token), so Supabase keeps the caller's session alive and revokes
only the user's *other* sessions. This is verified end-to-end against the real
project by `scripts/reset-password-lifecycle.ts`.

## The flow

Three calls, in order, on one screen flow. Bare paths — no `/api/v1` prefix.

### 1. `POST /auth/forgot-password`

```json
{ "email": "student@example.com" }
```

`200` → `{ "message": "Verification code sent. Check your inbox." }`

`404 USER_NOT_FOUND` if no account exists for that email.

### 2. `POST /auth/verify-otp`

```json
{ "email": "student@example.com", "code": "123456", "type": "recovery" }
```

`200` →

```json
{ "access_token": "eyJ...", "refresh_token": "..." }
```

**Keep both tokens.** This is the recovery session. The access token is valid
for one hour.

### 3. `POST /auth/reset-password`

```
Authorization: Bearer <access_token from step 2>
```

```json
{ "newPassword": "Password1", "confirmPassword": "Password1" }
```

`204 No Content`, empty body. Do not try to parse a body.

## Rules

**Send the token from step 2, unchanged.** Do not call `/auth/login` between
step 2 and step 3, and do not re-verify the OTP — a code is single-use, and a
password session is rejected on step 3 (`401`). The backend requires a session
that was minted by verifying an emailed code.

**A `204` does not log the user out.** The access and refresh tokens from step 2
still work afterwards. The app can go straight to the signed-in state with those
tokens, or send the user to the login screen with the new password — both are
valid. Do not clear the session on `204` and then call Supabase with the token
you just cleared.

**Do not call the Supabase SDK directly for auth.** The 403 in the screenshot
came from the app calling Supabase (`getUser()` / `updateUser()`) on its own,
not from this API. Route auth through the backend: `/auth/login`,
`/auth/refresh`, `/auth/me`, `/auth/logout`. If a `SupabaseClient` is kept in
the app for data access, hand it the session with `setSession` using tokens this
API returned, and never let two clients refresh the same refresh token — a
reused refresh token can revoke the session and reproduce the same
`session_not_found` message.

**Other devices are signed out.** The reset revokes the user's other sessions by
design. Any other device gets `401` on its next call and must log in again.

**Do not submit twice.** Disable the button while the request is in flight. A
second submit with the same password returns `422` ("must be different from your
previous password") even though the first one succeeded.

## Password rules (validate client-side to match the API)

- 8–128 characters
- at least one uppercase letter
- at least one digit
- `newPassword` and `confirmPassword` must match

The screen copy ("at least 8 characters with an uppercase letter and a number")
is already correct.

## Error handling on step 3

Every error is `{ "error": { "code", "message", "requestId" } }`. Branch on
`error.code`, not on the message text.

| Status | `code` | What happened | What the app should do |
|---|---|---|---|
| 401 | `INVALID_ACCESS_TOKEN` | Missing bearer, expired recovery session (>1h), or not a code-verified session | Send the user back to "Forgot password" and restart at step 1 |
| 422 | `VALIDATION_ERROR` | Passwords do not match, fail the strength rules, or match the previous password | Show the message inline under the field; keep the user on the screen |
| 429 | `RATE_LIMITED` | Too many attempts | Ask the user to wait, keep the session |
| 400 | `VALIDATION_ERROR` | Malformed JSON body | Client bug — check the request encoding |
| 500 | `INTERNAL_ERROR` | Backend failure | Generic retry message; `requestId` identifies the request in the logs |

`message` is user-safe on 401/422/429 and can be shown as-is. On `500` it is
always generic — never surface a raw Supabase message to the user.

## Checklist

- [ ] Tokens from `/auth/verify-otp` are stored and reused for `/auth/reset-password`
- [ ] No `/auth/login` or second OTP verification between step 2 and step 3
- [ ] `204` is handled as success with an empty body
- [ ] Session is not cleared before any remaining Supabase call
- [ ] No direct `supabase.auth.updateUser` / `getUser` in the reset flow
- [ ] Submit button disabled while the request is in flight
- [ ] Errors branch on `error.code`
