# Accessibility Preferences API Design

## Purpose

Store and return the ten toggles on Figma screen **E-03 · Navigation &
Accessibility** (node `358:435`) so a user's accessibility settings follow
their account across devices and are available to routing later.

Planning issue: navipet-senior-project/.github#40 (Sprint 2).

## Scope

In scope: one table, one feature module with a read route and a partial-update
route, tests.

Out of scope:

- Routing that honours the mobility preferences (navipet-senior-project/.github#25, Sprint 4).
- The "Report an accessibility issue" button on E-03. It is a separate
  subsystem and gets its own spec.
- The Flutter E-03 screen.

## Preferences

Ten independent booleans. The server applies no cross-field rules:
"Accessible routes" does not force "Avoid stairs" or "Prefer elevators".

| Group | API field | Column | Default |
| --- | --- | --- | --- |
| mobility | `accessibleRoutes` | `accessible_routes` | `false` |
| mobility | `avoidStairs` | `avoid_stairs` | `false` |
| mobility | `preferElevators` | `prefer_elevators` | `false` |
| mobility | `avoidSteepSlopes` | `avoid_steep_slopes` | `false` |
| guidance | `voiceGuidance` | `voice_guidance` | `true` |
| guidance | `hapticTurnAlerts` | `haptic_turn_alerts` | `true` |
| visuals | `highContrastMap` | `high_contrast_map` | `false` |
| visuals | `largerMapLabels` | `larger_map_labels` | `false` |
| visuals | `reduceMotion` | `reduce_motion` | `false` |
| visuals | `screenReaderDirections` | `screen_reader_directions` | `false` |

The defaults are a backend decision, not read from the design: the Figma frame
does not make on/off state legible. Mobility flags default to off so routing is
not altered for users who never opened the screen.

## Storage

Table `public.accessibility_preferences`, created by migration
`20261009055745_create_accessibility_preferences` (already applied):

- `user_id uuid` primary key, default `auth.uid()`, references
  `auth.users(id)` on delete cascade.
- The ten `boolean not null` columns above, plus `created_at` and `updated_at`
  (`updated_at` maintained by the existing `public.set_updated_at()` trigger
  function).
- Row level security enabled. `anon` has no privileges. `authenticated` has
  `select`, `insert`, `update` only, each restricted by a policy to
  `(select auth.uid()) = user_id`. There is no delete privilege; rows are
  removed only by the cascade when the account is deleted.

Rows are created lazily. A user with no row has every preference at its
default. The signup trigger `handle_new_user` is not changed.

## Database workflow (Supabase MCP)

All database work for this feature goes through the Supabase MCP server, not
the Dashboard SQL editor:

| Step | MCP tool | Rule |
| --- | --- | --- |
| Inspect current state | `list_tables`, `list_migrations` | Before any schema change. |
| Change schema | `apply_migration` | One named migration per change. The same SQL is saved to `supabase/migrations/<version>_<name>.sql`, where `<version>` is the value `list_migrations` reports after applying. |
| Verify access rules | `execute_sql` | Run as `authenticated` and `anon` inside a block that raises at the end, so the check rolls back and leaves no rows. |
| Check for regressions | `get_advisors` (`security`) | After every schema change. New findings on this table are fixed or explained in the pull request. |

Already done this way for `20261009055745_create_accessibility_preferences`.
The advisor reports `auth_allow_anonymous_sign_ins` on the new table; this is
accepted, because guest accounts may hold preferences, as they already do for
`profiles`, `classes`, `recent_searches`, and `task_completions`.

Any later schema change in this feature (for example a changed default) follows
the same four steps. Application code never uses the MCP server: at runtime the
API reaches the table only through `forAccessToken`, and automated tests never
touch the real project.

## API

New module `src/modules/accessibility/` (`accessibility.routes.ts`,
`accessibility.schema.ts`, `accessibility.types.ts`), registered last in
`app.ts`. Both routes use `preHandler: fastify.authenticate` and take the
identity from `request.user` / `request.accessToken` only.

### `GET /profiles/me/accessibility`

Returns all ten preferences. When the user has no row, returns the defaults.

Statuses: `200`, `401`, `429`, `502`.

### `PATCH /profiles/me/accessibility`

Body is any subset of the preferences, in the same grouped shape as the
response. Every group and every field is optional; groups and the root reject
unknown keys (`additionalProperties: false`); values must be booleans. A body
that names no preference at all is rejected.

The update is an upsert on `user_id`: the first PATCH creates the row with the
supplied values and column defaults for the rest; later PATCHes change only the
supplied fields. Returns the full ten preferences after the write.

Statuses: `200`, `400` (malformed JSON), `401`, `422` (schema violation or no
preference supplied), `429`, `502`. `422` is what the global error handler
returns for every schema failure; `429` comes from the global rate limit.

### Response shape (both routes)

```json
{
  "accessibility": {
    "mobility": {
      "accessibleRoutes": false,
      "avoidStairs": false,
      "preferElevators": false,
      "avoidSteepSlopes": false
    },
    "guidance": { "voiceGuidance": true, "hapticTurnAlerts": true },
    "visuals": {
      "highContrastMap": false,
      "largerMapLabels": false,
      "reduceMotion": false,
      "screenReaderDirections": false
    }
  }
}
```

The response schema has a stable `$id`, and both routes carry `tags` and
`summary` for the OpenAPI document.

## Data access

`src/plugins/supabase.ts` gains an `AccessibilityGateway`, following the
existing `RecentSearchGateway` pattern:

- `getAccessibilityPreferences(accessToken)` → stored preferences, or `null`
  when the user has no row.
- `updateAccessibilityPreferences(accessToken, userId, patch)` → the full
  preferences after the upsert.

Both use `forAccessToken(accessToken)` so row level security applies. The
admin client is not used. The gateway maps between snake_case columns and the
flat camelCase preference object; the route layer maps flat ↔ grouped.

The defaults returned for a missing row come from one exported constant in
`accessibility.types.ts` that mirrors the column defaults.

## Errors

Handlers throw `AppError` only. Any gateway failure that is not already an
`AppError` becomes `UPSTREAM_ERROR` with status `502` and the message
"Accessibility preference storage unavailable.", with the original error as
`cause`. Schema failures use the global validation path.

## Testing

Integration tests (`tests/integration/accessibility.test.ts`) drive the app
through `buildTestApp` with a fake gateway passed via `supabaseResources`:

- GET with no stored row returns the defaults.
- GET returns stored values.
- PATCH with one field changes that field and leaves the other nine unchanged.
- PATCH across several groups applies all supplied fields.
- PATCH with an empty object, an empty group only, an unknown key, or a
  non-boolean value returns `422`.
- Both routes return `401` without a bearer token.
- Both routes return `502` when the gateway throws.

A unit test asserts the defaults constant matches the table in this spec.

Row level security was verified against the live project when the migration
was applied (owner upsert succeeds; other users' rows are invisible and not
updatable; inserting for another `user_id` and any `anon` access are denied).

## Open questions (do not block implementation)

- Whether the E-01 "Voice and Haptics" row edits the same two guidance
  preferences as E-03.
- Final product defaults, once the design states them. Changing one is an
  `alter column ... set default` plus the constant.
