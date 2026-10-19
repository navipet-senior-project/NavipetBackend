-- VEC door coordinates in the MultiSet MapSet frame.
-- Data import is separate: npm run vec-points:dry-run / vec-points:apply.

set lock_timeout = '5s';
set statement_timeout = '60s';

do $$
begin
  if to_regclass('public.vec_destination_points') is not null then
    raise exception
      'vec_destination_points already exists; inspect it before applying this migration';
  end if;
  if to_regprocedure('public.set_campus_destination_updated_at()') is null then
    raise exception
      'set_campus_destination_updated_at() is missing; apply the campus schema first';
  end if;
end
$$;

create table public.vec_destination_points (
  id uuid primary key default gen_random_uuid(),
  point_key text not null,
  point_type text not null,
  room_number text not null,
  floor text not null,
  x double precision not null,
  y double precision not null,
  z double precision not null,
  heading_deg double precision,
  map_provider text not null,
  map_code text not null,
  map_version integer not null,
  frame text not null,
  destination_id uuid not null
    references public.campus_destinations(id)
    on update cascade
    on delete restrict,
  exported_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint vec_destination_points_key_unique
    unique (map_code, map_version, point_key),
  constraint vec_destination_points_key_check
    check (point_key ~ '^VEC[A-Za-z0-9-]{1,40}$'),
  constraint vec_destination_points_type_check
    check (point_type = 'door'),
  constraint vec_destination_points_room_number_check
    check (char_length(btrim(room_number)) between 1 and 20),
  constraint vec_destination_points_floor_check
    check (char_length(btrim(floor)) between 1 and 10),
  constraint vec_destination_points_provider_check
    check (map_provider = 'multiset'),
  constraint vec_destination_points_map_code_check
    check (char_length(btrim(map_code)) between 1 and 80),
  constraint vec_destination_points_frame_check
    check (frame = 'multiset-mapset'),
  constraint vec_destination_points_version_check
    check (map_version > 0),
  constraint vec_destination_points_heading_check
    check (heading_deg is null or (heading_deg >= 0 and heading_deg < 360)),
  constraint vec_destination_points_coordinates_check
    check (
      x not in ('NaN', 'Infinity', '-Infinity')
      and y not in ('NaN', 'Infinity', '-Infinity')
      and z not in ('NaN', 'Infinity', '-Infinity')
    )
);

create unique index vec_destination_points_one_active_door_per_room
on public.vec_destination_points (destination_id)
where active;

create trigger vec_destination_points_set_updated_at
before update on public.vec_destination_points
for each row execute function public.set_campus_destination_updated_at();

alter table public.vec_destination_points enable row level security;

revoke all on table public.vec_destination_points from anon, authenticated;
grant select on table public.vec_destination_points to anon, authenticated;
grant select, insert, update, delete
on table public.vec_destination_points
to service_role;

create policy "Active VEC door points are publicly readable"
on public.vec_destination_points
for select
to anon, authenticated
using (active);
