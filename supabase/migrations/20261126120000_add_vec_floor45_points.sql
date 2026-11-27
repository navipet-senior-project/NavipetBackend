-- Add VEC floors 4-5: 14 room rows in campus_destinations + 14 door points,
-- and move the VEC330 / VEC331 doors to their confirmed positions.
-- Floors 1-3 rows are otherwise left untouched. Repeat-safe: a replay
-- inserts and updates nothing. Fails before writing if any target row
-- already exists with different data. Rollback:
-- supabase/rollbacks/20261126120000_add_vec_floor45_points_down.sql.
-- Checks: supabase/tests/vec_floor45_checks.sql.
--
-- Source: NaviPetUnity branch floors_12345 (commit c14d82d),
-- Assets/IndoorNavigation/Data/vec_floors12345.json, door objects only
-- (vec_destination_points holds doors; elevators, stairs and bathrooms are
-- not stored, so VECelev5A/5B's floor_4 label in that file is not used).
-- Room 501 is VEC501 in that file; no VEC 510 row exists or is created.
-- XZ and heading use the floor-3 transform, which reproduces all 26
-- existing floor 1-3 rows to 0.0001 m: rotate -5.3563 deg about Y,
-- x' = 0.99563 x + 0.09335 z + 0.2794, z' = -0.09335 x + 0.99563 z + 0.8376,
-- heading_deg = rotationY + 5.36. y = Unity y - 2.34, the offset measured
-- for floor 3 in the MultiSet viewer (floor 4: 12.295 -> 9.955,
-- floor 5: 16.729 -> 14.389); floors 4-5 slabs were not measured.

set lock_timeout = '5s';
set statement_timeout = '60s';

drop table if exists pg_temp.vec_floor45_doors, pg_temp.vec_floor3_moves;

create temporary table vec_floor45_doors as
select * from (values
  ('VEC402', '402', '4', -11.9650,  9.955, 26.2164,   5.36),
  ('VEC417', '417', '4',  15.2304,  9.955, 23.0740,   5.36),
  ('VEC418', '418', '4',  24.9279,  9.955, 22.1648,   5.36),
  ('VEC419', '419', '4', -15.1313,  9.955, 23.4047, 185.36),
  ('VEC420', '420', '4',  -3.5019,  9.955, 22.1687, 185.36),
  ('VEC424', '424', '4',   9.8688,  9.955, 20.7363, 185.36),
  ('VEC425', '425', '4',  17.8453,  9.955, 19.7906, 185.36),
  ('VEC501', '501', '5', -12.3042, 14.389, 26.2411,   5.36),
  ('VEC514', '514', '5',  11.8541, 14.389, 23.9138,   5.36),
  ('VEC515', '515', '5',  15.4981, 14.389, 23.5722,   5.36),
  ('VEC516', '516', '5',  25.7322, 14.389, 22.6127,   5.36),
  ('VEC518', '518', '5', -24.0102, 14.389, 24.3677, 185.36),
  ('VEC519', '519', '5',  -3.8984, 14.389, 22.4821, 185.36),
  ('VEC523', '523', '5',  10.1002, 14.389, 21.1696, 185.36)
) as v(point_key, room, floor, x, y, z, heading);

create temporary table vec_floor3_moves as
select * from (values
  ('VEC330', 10.0452, 21.5464, 19.1224, 20.6953),
  ('VEC331', 19.0855, 20.6988, 22.0127, 20.4243)
) as v(point_key, old_x, old_z, new_x, new_z);

do $$
declare
  vec_building_id uuid;
  problem text;
begin
  select id into vec_building_id
  from public.campus_destinations
  where type = 'building' and code = 'VEC' and active
    and metadata ? 'footprint';
  if vec_building_id is null then
    raise exception 'active VEC building row with a footprint is missing';
  end if;

  if exists (select 1 from public.campus_destinations
             where building_code = 'VEC' and type = 'room' and room_number = '510') then
    raise exception 'a VEC 510 room exists; room 501 replaces it, inspect before applying';
  end if;

  select string_agg(d.import_key, ', ') into problem
  from vec_floor45_doors v
  join public.campus_destinations d
    on d.import_key = 'source:navipet_vec_rooms:vec-' || v.room
  where (d.type, d.code, d.building_code, d.room_number, d.floor_number,
         d.parent_destination_id, d.source, d.active)
    is distinct from
        ('room', 'VEC-' || v.room, 'VEC', v.room, v.floor,
         vec_building_id, 'navipet_vec_rooms', true);
  if problem is not null then
    raise exception 'existing room rows differ from the floor 4-5 export: %', problem;
  end if;

  select string_agg(p.point_key, ', ') into problem
  from vec_floor45_doors v
  join public.vec_destination_points p
    on p.map_code = 'MSET_XTBY7AM7ZK77' and p.map_version = 1
    and p.point_key = v.point_key
  where (p.room_number, p.floor, p.x, p.y, p.z, p.heading_deg, p.active)
    is distinct from (v.room, v.floor, v.x, v.y, v.z, v.heading, true);
  if problem is not null then
    raise exception 'existing door points differ from the floor 4-5 export: %', problem;
  end if;

  -- A different active door on a floor 4-5 room would make the insert skip silently.
  select string_agg(p.point_key, ', ') into problem
  from vec_floor45_doors v
  join public.campus_destinations d
    on d.import_key = 'source:navipet_vec_rooms:vec-' || v.room
  join public.vec_destination_points p
    on p.destination_id = d.id and p.active
  where (p.map_code, p.map_version, p.point_key)
    is distinct from ('MSET_XTBY7AM7ZK77', 1, v.point_key);
  if problem is not null then
    raise exception 'floor 4-5 rooms already have other active doors: %', problem;
  end if;

  select string_agg(m.point_key, ', ') into problem
  from vec_floor3_moves m
  left join public.vec_destination_points p
    on p.map_code = 'MSET_XTBY7AM7ZK77' and p.map_version = 1
    and p.point_key = m.point_key and p.floor = '3' and p.active
    and ((p.x = m.old_x and p.z = m.old_z) or (p.x = m.new_x and p.z = m.new_z))
  where p.id is null;
  if problem is not null then
    raise exception 'floor 3 doors are missing or at unexpected positions: %', problem;
  end if;
end
$$;

insert into public.campus_destinations (
  import_key, type, name, code, parent_destination_id, building_code,
  room_number, floor_number, source, source_id, metadata
)
select
  'source:navipet_vec_rooms:vec-' || v.room,
  'room',
  'VEC ' || v.room,
  'VEC-' || v.room,
  b.id,
  'VEC',
  v.room,
  v.floor,
  'navipet_vec_rooms',
  'VEC-' || v.room,
  jsonb_build_object('footprint', b.metadata -> 'footprint')
from vec_floor45_doors v
cross join public.campus_destinations b
where b.type = 'building' and b.code = 'VEC' and b.active
on conflict (import_key) do nothing;

insert into public.vec_destination_points (
  point_key, point_type, room_number, floor, x, y, z, heading_deg,
  map_provider, map_code, map_version, frame, destination_id, exported_at
)
select
  v.point_key, 'door', v.room, v.floor, v.x, v.y, v.z, v.heading,
  'multiset', 'MSET_XTBY7AM7ZK77', 1, 'multiset-mapset', d.id,
  '2026-11-26T10:19:42Z'
from vec_floor45_doors v
join public.campus_destinations d
  on d.import_key = 'source:navipet_vec_rooms:vec-' || v.room
on conflict (map_code, map_version, point_key) do nothing;

update public.vec_destination_points p
set x = m.new_x, z = m.new_z
from vec_floor3_moves m
where p.map_code = 'MSET_XTBY7AM7ZK77' and p.map_version = 1
  and p.point_key = m.point_key and p.floor = '3' and p.active
  and p.x = m.old_x and p.z = m.old_z;

do $$
begin
  if (select count(*) from vec_floor45_doors v
      join public.vec_destination_points p
        on p.map_code = 'MSET_XTBY7AM7ZK77' and p.map_version = 1
        and p.point_key = v.point_key and p.active
      join public.campus_destinations d
        on d.id = p.destination_id and d.active
        and d.import_key = 'source:navipet_vec_rooms:vec-' || v.room) <> 14 then
    raise exception 'expected 14 active floor 4-5 doors linked to their rooms';
  end if;
  if (select count(*) from vec_floor3_moves m
      join public.vec_destination_points p
        on p.map_code = 'MSET_XTBY7AM7ZK77' and p.map_version = 1
        and p.point_key = m.point_key and p.active
        and p.x = m.new_x and p.z = m.new_z) <> 2 then
    raise exception 'expected VEC330 and VEC331 at their confirmed positions';
  end if;
end
$$;

drop table vec_floor45_doors, vec_floor3_moves;
