-- Campus autocomplete schema. Data import is intentionally separate.
-- This migration does not alter profiles, classes, or task_completions.

set lock_timeout = '5s';
set statement_timeout = '60s';

do $$
begin
  if to_regclass('public.campus_destinations') is not null
    or to_regclass('public.destination_aliases') is not null
    or to_regclass('public.destination_provider_refs') is not null
    or to_regprocedure(
      'public.search_campus_destinations(text,integer)'
    ) is not null
    or to_regprocedure(
      'public.set_campus_destination_updated_at()'
    ) is not null
  then
    raise exception
      'Campus destination tables already exist; inspect them before applying this migration';
  end if;
end
$$;

create extension if not exists pg_trgm with schema extensions;

create table public.campus_destinations (
  id uuid primary key default gen_random_uuid(),
  import_key text not null,
  type text not null,
  name text not null,
  code text,
  parent_destination_id uuid,
  building_code text,
  room_number text,
  floor_number text,
  latitude double precision,
  longitude double precision,
  outdoor_destination_latitude double precision,
  outdoor_destination_longitude double precision,
  source text not null,
  source_id text,
  source_url text,
  searchable boolean not null default true,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (
    to_tsvector(
      'simple'::regconfig,
      coalesce(name, '') || ' ' ||
      coalesce(code, '') || ' ' ||
      coalesce(building_code, '') || ' ' ||
      coalesce(room_number, '') || ' ' ||
      coalesce(floor_number, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint campus_destinations_import_key_key unique (import_key),
  constraint campus_destinations_parent_destination_id_fkey
    foreign key (parent_destination_id)
    references public.campus_destinations(id)
    on update cascade
    on delete restrict,
  constraint campus_destinations_type_check check (
    type in (
      'building',
      'room',
      'entrance',
      'parking',
      'dining',
      'service',
      'amenity',
      'transit',
      'landmark'
    )
  ),
  constraint campus_destinations_name_check check (
    char_length(btrim(name)) between 1 and 200
  ),
  constraint campus_destinations_import_key_check check (
    char_length(btrim(import_key)) between 1 and 300
  ),
  constraint campus_destinations_code_check check (
    code is null or char_length(btrim(code)) between 1 and 80
  ),
  constraint campus_destinations_source_check check (
    char_length(btrim(source)) between 1 and 120
  ),
  constraint campus_destinations_source_id_check check (
    source_id is null or char_length(btrim(source_id)) between 1 and 300
  ),
  constraint campus_destinations_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint campus_destinations_not_own_parent_check check (
    parent_destination_id is null or parent_destination_id <> id
  ),
  constraint campus_destinations_room_fields_check check (
    type <> 'room'
    or (parent_destination_id is not null and room_number is not null)
  ),
  constraint campus_destinations_coordinates_pair_check check (
    (latitude is null) = (longitude is null)
  ),
  constraint campus_destinations_latitude_check check (
    latitude is null or latitude between -90 and 90
  ),
  constraint campus_destinations_longitude_check check (
    longitude is null or longitude between -180 and 180
  ),
  constraint campus_destinations_outdoor_coordinates_pair_check check (
    (outdoor_destination_latitude is null) =
    (outdoor_destination_longitude is null)
  ),
  constraint campus_destinations_outdoor_latitude_check check (
    outdoor_destination_latitude is null
    or outdoor_destination_latitude between -90 and 90
  ),
  constraint campus_destinations_outdoor_longitude_check check (
    outdoor_destination_longitude is null
    or outdoor_destination_longitude between -180 and 180
  )
);

create unique index campus_destinations_normalized_code_key
on public.campus_destinations (lower(btrim(code)))
where code is not null;

create unique index campus_destinations_source_record_key
on public.campus_destinations (lower(btrim(source)), btrim(source_id))
where source_id is not null;

create index campus_destinations_parent_destination_id_idx
on public.campus_destinations (parent_destination_id)
where parent_destination_id is not null;

create index campus_destinations_searchable_type_name_idx
on public.campus_destinations (type, name)
where active and searchable;

create index campus_destinations_search_vector_idx
on public.campus_destinations using gin (search_vector)
where active and searchable;

create index campus_destinations_name_trgm_idx
on public.campus_destinations
using gin (lower(name) extensions.gin_trgm_ops)
where active and searchable;

create index campus_destinations_building_code_idx
on public.campus_destinations (lower(btrim(building_code)))
where building_code is not null and active and searchable;

create table public.destination_aliases (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null
    references public.campus_destinations(id)
    on update cascade
    on delete cascade,
  alias text not null,
  normalized_alias text generated always as (lower(btrim(alias))) stored,
  source text not null,
  source_id text,
  searchable boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (
    to_tsvector('simple'::regconfig, alias)
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint destination_aliases_alias_check check (
    char_length(btrim(alias)) between 1 and 200
  ),
  constraint destination_aliases_source_check check (
    char_length(btrim(source)) between 1 and 120
  ),
  constraint destination_aliases_source_id_check check (
    source_id is null or char_length(btrim(source_id)) between 1 and 300
  ),
  constraint destination_aliases_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint destination_aliases_destination_normalized_alias_key
    unique (destination_id, normalized_alias)
);

create index destination_aliases_destination_id_idx
on public.destination_aliases (destination_id);

create index destination_aliases_search_vector_idx
on public.destination_aliases using gin (search_vector)
where searchable;

create index destination_aliases_normalized_alias_trgm_idx
on public.destination_aliases
using gin (normalized_alias extensions.gin_trgm_ops)
where searchable;

create table public.destination_provider_refs (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null
    references public.campus_destinations(id)
    on update cascade
    on delete cascade,
  provider text not null,
  scope text not null default '',
  external_id text not null,
  external_category_ids text[] not null default '{}',
  source text not null,
  source_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint destination_provider_refs_provider_check check (
    provider in ('concept3d', 'mapbox', 'multiset')
  ),
  constraint destination_provider_refs_scope_check check (
    char_length(scope) <= 200
  ),
  constraint destination_provider_refs_external_id_check check (
    char_length(btrim(external_id)) between 1 and 300
  ),
  constraint destination_provider_refs_source_check check (
    char_length(btrim(source)) between 1 and 120
  ),
  constraint destination_provider_refs_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint destination_provider_refs_provider_scope_external_id_key
    unique (provider, scope, external_id)
);

create index destination_provider_refs_destination_id_idx
on public.destination_provider_refs (destination_id);

create function public.set_campus_destination_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_campus_destination_updated_at() from public;

create trigger campus_destinations_set_updated_at
before update on public.campus_destinations
for each row execute function public.set_campus_destination_updated_at();

create trigger destination_aliases_set_updated_at
before update on public.destination_aliases
for each row execute function public.set_campus_destination_updated_at();

create trigger destination_provider_refs_set_updated_at
before update on public.destination_provider_refs
for each row execute function public.set_campus_destination_updated_at();

alter table public.campus_destinations enable row level security;
alter table public.destination_aliases enable row level security;
alter table public.destination_provider_refs enable row level security;

revoke all on table public.campus_destinations from anon, authenticated;
revoke all on table public.destination_aliases from anon, authenticated;
revoke all on table public.destination_provider_refs from anon, authenticated;

grant select on table public.campus_destinations to anon, authenticated;
grant select on table public.destination_aliases to anon, authenticated;

grant select, insert, update, delete
on table public.campus_destinations,
  public.destination_aliases,
  public.destination_provider_refs
to service_role;

create policy "Active searchable campus destinations are publicly readable"
on public.campus_destinations
for select
to anon, authenticated
using (active and searchable);

create policy "Aliases of active searchable destinations are publicly readable"
on public.destination_aliases
for select
to anon, authenticated
using (
  searchable
  and exists (
    select 1
    from public.campus_destinations as destination
    where destination.id = destination_aliases.destination_id
      and destination.active
      and destination.searchable
  )
);

create function public.search_campus_destinations(
  search_query text,
  result_limit integer default 20
)
returns table (
  id uuid,
  type text,
  name text,
  code text,
  aliases text[],
  parent_destination_id uuid,
  building_code text,
  room_number text,
  floor_number text,
  latitude double precision,
  longitude double precision,
  outdoor_destination_latitude double precision,
  outdoor_destination_longitude double precision,
  source text,
  source_id text,
  source_url text,
  metadata jsonb,
  rank real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select
      lower(btrim(coalesce(search_query, ''))) as normalized_query,
      plainto_tsquery('simple'::regconfig, btrim(coalesce(search_query, '')))
        as text_query,
      least(greatest(coalesce(result_limit, 20), 1), 50) as limited_result_count
  ),
  matches as (
    select
      destination.id,
      destination.type,
      destination.name,
      destination.code,
      coalesce(alias_match.aliases, '{}'::text[]) as aliases,
      destination.parent_destination_id,
      destination.building_code,
      destination.room_number,
      destination.floor_number,
      destination.latitude,
      destination.longitude,
      destination.outdoor_destination_latitude,
      destination.outdoor_destination_longitude,
      destination.source,
      destination.source_id,
      destination.source_url,
      destination.metadata,
      greatest(
        case
          when lower(btrim(destination.code)) = input.normalized_query then 1.0
          else 0.0
        end,
        case
          when lower(destination.name) = input.normalized_query then 0.98
          else 0.0
        end,
        case
          when lower(btrim(destination.code)) like input.normalized_query || '%'
            then 0.94
          else 0.0
        end,
        case when alias_match.has_exact then 0.92 else 0.0 end,
        case
          when lower(destination.name) like input.normalized_query || '%'
            then 0.90
          else 0.0
        end,
        case when alias_match.has_prefix then 0.88 else 0.0 end,
        ts_rank(destination.search_vector, input.text_query),
        extensions.similarity(lower(destination.name), input.normalized_query),
        coalesce(alias_match.alias_similarity, 0.0)
      )::real as rank,
      input.limited_result_count
    from input
    join public.campus_destinations as destination
      on destination.active and destination.searchable
    left join lateral (
      select
        array_agg(alias.alias order by alias.alias) as aliases,
        bool_or(alias.normalized_alias = input.normalized_query) as has_exact,
        bool_or(alias.normalized_alias like input.normalized_query || '%')
          as has_prefix,
        bool_or(alias.normalized_alias like '%' || input.normalized_query || '%')
          as has_substring,
        bool_or(alias.search_vector @@ input.text_query) as has_text_match,
        max(
          extensions.similarity(alias.normalized_alias, input.normalized_query)
        ) as alias_similarity
      from public.destination_aliases as alias
      where alias.destination_id = destination.id
        and alias.searchable
    ) as alias_match on true
    where input.normalized_query <> ''
      and (
        lower(btrim(destination.code)) = input.normalized_query
        or lower(btrim(destination.code)) like input.normalized_query || '%'
        or lower(destination.name) like '%' || input.normalized_query || '%'
        or destination.search_vector @@ input.text_query
        or extensions.similarity(
          lower(destination.name),
          input.normalized_query
        ) >= 0.2
        or alias_match.has_substring
        or alias_match.has_text_match
        or alias_match.alias_similarity >= 0.2
      )
  )
  select
    matches.id,
    matches.type,
    matches.name,
    matches.code,
    matches.aliases,
    matches.parent_destination_id,
    matches.building_code,
    matches.room_number,
    matches.floor_number,
    matches.latitude,
    matches.longitude,
    matches.outdoor_destination_latitude,
    matches.outdoor_destination_longitude,
    matches.source,
    matches.source_id,
    matches.source_url,
    matches.metadata,
    matches.rank
  from matches
  order by
    matches.rank desc,
    matches.name,
    matches.id
  limit (select limited_result_count from input);
$$;

revoke all
on function public.search_campus_destinations(text, integer)
from public;

grant execute
on function public.search_campus_destinations(text, integer)
to anon, authenticated, service_role;

comment on table public.campus_destinations is
  'Canonical CSULB campus destinations used by NaviPet autocomplete.';

comment on table public.destination_aliases is
  'Verified alternate search names for canonical campus destinations.';

comment on table public.destination_provider_refs is
  'Backend-only Concept3D, Mapbox, and Multiset identifiers.';

reset lock_timeout;
reset statement_timeout;
