set lock_timeout = '5s';
set statement_timeout = '60s';

alter table public.campus_destinations
  add column arrival_radius_meters smallint
  constraint campus_destinations_arrival_radius_meters_check
  check (arrival_radius_meters between 3 and 50);

drop function public.search_campus_destinations(text, integer);

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
  arrival_radius_meters smallint,
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
      destination.arrival_radius_meters,
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
    matches.arrival_radius_meters,
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

reset lock_timeout;
reset statement_timeout;
