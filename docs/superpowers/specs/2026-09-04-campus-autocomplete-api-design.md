# Campus Autocomplete API Design

## Goal

Expose verified CSULB destinations through Fastify while keeping Supabase as the primary source and Mapbox Search Box as an optional, temporary fallback.

## Architecture

Add a `campus` feature module with route schemas, handlers, and a focused service. Extend the existing Supabase resource gateway with campus read methods so handlers never access raw clients. Add an injected Mapbox search gateway that is disabled unless server-side configuration is present.

Local autocomplete calls `search_campus_destinations`, then normalizes and reranks returned records. Room-shaped queries resolve the building and query actual room children; they never synthesize room records. If no room exists, the resolved building may be returned as a labeled alternative.

Mapbox fallback uses Search Box `/forward`, not `/suggest`. `/forward` is a one-request search endpoint and therefore has no interactive session-token contract. Results remain temporary, are labeled external, and are never written to Supabase.

## HTTP Contract

- `GET /autocomplete?q=<query>&limit=10`: public search; `q` needs two meaningful alphanumeric characters; limit defaults to 10 and is capped at 20.
- `GET /places/:placeId`: public lookup of one active, searchable UUID; missing records return 404.
- `GET /buildings/:buildingCode/rooms?q=<query>`: public search of verified room children under an active, searchable building; unknown buildings return 404.

Validation failures use the existing `422 VALIDATION_ERROR` envelope. Supabase or Mapbox failures become logged `502` upstream errors through `AppError`. No-result autocomplete returns `{ query, results: [] }`.

## Ranking and Normalization

Normalize case, outer whitespace, repeated whitespace, punctuation, hyphens, and room markers. Recognize compact and reordered room forms such as `COB140` and `room 140 COB`.

Rank exact building-room, exact code, exact canonical name, exact alias, prefix, controlled fuzzy, verified category, then external fallback. Category matching reads only controlled metadata category values; incidental words in descriptions do not count.

## Response Safety

Return only public fields. Prefer outdoor destination coordinates over canonical point coordinates and omit incomplete coordinate pairs. Provider references remain backend-only; verified Multiset IDs may be exposed only as the navigation destination value. Never expose import keys, raw metadata, database rank, timestamps, or provider bookkeeping.

## Tests

Use injected fake gateways. Unit tests cover normalization and ranking. Integration tests cover every requested query family, validation, inactive/non-searchable filtering contracts, 404 behavior, fallback suppression/use, and public response shape. No test contacts Supabase or Mapbox.
