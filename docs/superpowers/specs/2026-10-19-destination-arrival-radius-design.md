# Destination Arrival Radius Design

## Purpose

Let each campus destination carry its own arrival radius so the app can end
outdoor navigation at a distance that suits the destination (a large building
may need more than the current fixed 10 m).

Backend issue: navipet-senior-project/NavipetBackend#67 (rewritten from the
original server-side arrival-check proposal). Flutter issue: a companion
Sprint 2 issue in navipet-senior-project/.github.

## Decision: arrival stays on the device

The app already detects arrival locally
(`NaviPetFlutter lib/data/navigation_flow_controller.dart:681-686`): two
consecutive GPS fixes with accuracy ≤ 10 m and distance to the destination
≤ 10 m. The backend only supplies a per-destination radius as static data with
the destination it already returns.

Rejected alternatives:

- **`POST /navigation/arrival-check` per GPS fix** (original #67). The client
  still supplies its own coordinates, so a server-side check is no harder to
  spoof than a local one. It cannot apply the accuracy and consecutive-fix
  rule without receiving both, at which point the app duplicates it anyway.
  It adds a request per fix, fails in poor signal, and sends a precise
  location trail to the server.
- **Webhooks / WebSockets.** Nothing server-side changes during a walk, so
  there is nothing to push. The radius is configuration.

A server-side event is warranted only if the server must act on arrival (e.g.
gem rewards, navipet-senior-project/.github#34). That would be one `POST` on
arrival, specified separately, and is out of scope here.

## Scope

In scope:

- One migration: a nullable column, a range constraint, and the recreated
  search function.
- One optional response field on the existing campus result.
- Flutter consumption of the field (companion issue, see below).

Out of scope:

- Seeding radius values. The column ships with every value `null`, which keeps
  today's behaviour. Values are set per building in a follow-up.
- Inheriting a building's radius into its rooms or entrances.
- Server-side arrival detection or arrival events.

## Backend

### Storage

Migration `<timestamp>_add_destination_arrival_radius`:

- `alter table public.campus_destinations add column arrival_radius_meters smallint`
  (nullable, no default).
- `check (arrival_radius_meters between 3 and 50)`. Below about 3 m consumer
  GPS cannot resolve the distance; above 50 m "arrived" no longer means at the
  destination.
- `null` means "not configured". The backend applies no default; the 10 m
  fallback lives only in the app.
- `drop function public.search_campus_destinations(text, integer)` and recreate
  it with `arrival_radius_meters smallint` added to its `returns table (...)`
  list, then re-apply the existing `revoke all` / `grant execute` statements.
  `create or replace` cannot change a function's return type, and without this
  the autocomplete text search never sees the column.
- No grant or RLS change: `anon` and `authenticated` already have table-level
  `select` on `campus_destinations`, gated by the existing read policy.

No parent inheritance. Rooms and entrances never inherit outdoor coordinates
from their building (`src/modules/campus/outdoor-fallback.ts`, `isDerivable`),
so inheriting a radius for a point that is itself not inherited would be
inconsistent.

### API

`PublicCampusResultSchema.navigation` (`src/modules/campus/campus.schema.ts`)
gains:

```ts
arrivalRadiusMeters: Type.Optional(Type.Integer({ minimum: 3, maximum: 50 }))
```

Emitted only when the row has a non-null radius **and**
`navigation.outdoorDestination` is present. A radius without a point to arrive
at is meaningless. Two places set `outdoorDestination`, and both must apply
this rule:

- `toPublicCampusResult`, for stored coordinates.
- `withDerivedOutdoorDestination`, for coordinates derived from Mapbox when the
  row has none. Without this, a building whose point is derived would lose its
  radius.

Because every campus route maps through `toPublicCampusResult`, the field
appears on `/autocomplete`, `/places/:placeId`, and
`/buildings/:buildingCode/rooms`. Mapbox `external` results never carry it.

The field is additive and optional. Existing clients ignore it.

Data path: `CampusDestinationRow.arrival_radius_meters` →
`CampusDestinationRecord.arrivalRadiusMeters: number | null` →
`navigation.arrivalRadiusMeters`. Every `select(...)` column list on
`campus_destinations` in `src/plugins/supabase.ts` adds the column.

### Tests

Integration (`app.inject()`, fake `supabaseResources`):

- Row with radius and coordinates → `navigation.arrivalRadiusMeters` present.
- Row with `null` radius → field absent.
- Row with radius but no outdoor coordinates (and no derived ones) → field
  absent.
- Row with radius whose outdoor destination is derived → field present.
- External Mapbox result → field absent.

Migration verification (by hand against a branch or local stack, not CI):
an `update` setting 2 or 51 is rejected by the constraint; the RPC returns
the column.

## Flutter (companion issue)

### Parsing

Read `navigation.arrivalRadiusMeters` (optional int) into the destination model
beside `outdoorDestination`. Missing or outside 3–50 → 10 m default.

### Arrival rule

Replace the shared `10` literals at `navigation_flow_controller.dart:681-686`
with two named values:

- `arrivalRadius` = server value or 10. Arrival requires
  `destinationGap <= arrivalRadius`.
- `arrivalAccuracyLimit` = `min(arrivalRadius, 20)`. A 25 m destination must
  not stall waiting for ≤ 10 m accuracy. The 20 m cap matches the existing
  reliable-fix threshold at `:667`. This formula is a starting point to be
  confirmed on a real walk.

The two-consecutive-accurate-fixes rule and its reset on any miss stay.

### Approach state

- `approachRadius = 15`, an app constant (not per destination).
- The first accuracy-gated fix within 15 m emits a single `FlowApproaching`
  state (e.g. an "Arriving soon" banner). It does not repeat.
- If `arrivalRadius >= approachRadius`, the approach state is skipped.

This is unrelated to the "~15 m maneuver advance" in
navipet-senior-project/.github#52, which is step advancement.

### Tests

Controller unit tests with a fake GPS stream:

- No field → arrival at 10 m.
- Server value 25 → arrival at 25 m; fixes with 15 m accuracy count.
- One accurate fix does not arrive; two consecutive do; a miss between resets.
- Approach fires once at 15 m; never when the radius is ≥ 15.
- Out-of-range server value → 10 m.

### Ordering

The Flutter change can merge before the backend. Without the field its
behaviour is identical to today.
