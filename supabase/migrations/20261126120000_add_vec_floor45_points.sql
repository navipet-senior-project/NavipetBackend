-- Add VEC floors 4-5: 14 room rows in campus_destinations + 14 door points,
-- and move the VEC330 / VEC331 doors to their confirmed positions.
-- Floors 1-3 rows are otherwise left untouched. Repeat-safe: a replay
-- inserts and updates nothing. Fails before writing if any target row
-- already exists with different data. There is no automated rollback.
-- Checks: supabase/tests/vec_floor45_checks.sql.
--
-- Source: NaviPetUnity branch floors_12345 (commit c14d82d),
-- Assets/IndoorNavigation/Data/vec_floors12345.json, door objects only
-- (vec_destination_points holds doors only). VECelev5A and VECelev5B
-- belong to floor 5. Correct their floor_4 labels in the Unity file above.
-- VEC501 replaces VEC 510. An active VEC 510 room blocks the migration.
-- Inactive VEC 510 history is preserved.
-- XZ and heading use the floor-3 transform, which reproduces all 26
-- existing floor 1-3 rows to 0.0001 m: rotate -5.3563 deg about Y,
-- x' = 0.99563 x + 0.09335 z + 0.2794, z' = -0.09335 x + 0.99563 z + 0.8376,
-- heading_deg = rotationY + 5.36. For floors 4-5, the shared Unity MapSet
-- transform subtracts 2.2116 from Y (floor 4: 12.295 -> 10.0834,
-- floor 5: 16.729 -> 14.5174). Floor 3 retains its measured Y of 6.04.

set lock_timeout = '5s';
set statement_timeout = '60s';

drop table if exists pg_temp.vec_floor45_doors, pg_temp.vec_floor3_moves;

create temporary table vec_floor45_doors as
select * from (values
  ('VEC402', '402', '4', -11.9650, 10.0834, 26.2164,   5.36),
  ('VEC417', '417', '4',  15.2304, 10.0834, 23.0740,   5.36),
  ('VEC418', '418', '4',  24.9279, 10.0834, 22.1648,   5.36),
  ('VEC419', '419', '4', -15.1313, 10.0834, 23.4047, 185.36),
  ('VEC420', '420', '4',  -3.5019, 10.0834, 22.1687, 185.36),
  ('VEC424', '424', '4',   9.8688, 10.0834, 20.7363, 185.36),
  ('VEC425', '425', '4',  17.8453, 10.0834, 19.7906, 185.36),
  ('VEC501', '501', '5', -12.3042, 14.5174, 26.2411,   5.36),
  ('VEC514', '514', '5',  11.8541, 14.5174, 23.9138,   5.36),
  ('VEC515', '515', '5',  15.4981, 14.5174, 23.5722,   5.36),
  ('VEC516', '516', '5',  25.7322, 14.5174, 22.6127,   5.36),
  ('VEC518', '518', '5', -24.0102, 14.5174, 24.3677, 185.36),
  ('VEC519', '519', '5',  -3.8984, 14.5174, 22.4821, 185.36),
  ('VEC523', '523', '5',  10.1002, 14.5174, 21.1696, 185.36)
) as v(point_key, room, floor, x, y, z, heading);

create temporary table vec_floor3_moves as
select * from (values
  ('VEC330', '330', 10.0452, 21.5464, 19.1224, 20.6953),
  ('VEC331', '331', 19.0855, 20.6988, 22.0127, 20.4243)
) as v(point_key, room, old_x, old_z, new_x, new_z);

do $$
declare
  vec_building_id uuid;
  vec_footprint jsonb;
  export_time constant timestamptz := '2026-11-26T10:19:42Z';
  problem text;
begin
  select id, metadata -> 'footprint' into vec_building_id, vec_footprint
  from public.campus_destinations
  where type = 'building' and code = 'VEC' and active and searchable
  for share;
  if vec_building_id is null then
    raise exception 'active searchable VEC building row is missing';
  end if;

  if exists (select 1 from public.campus_destinations
             where building_code = 'VEC' and type = 'room' and room_number = '510' and active) then
    raise exception 'an active VEC 510 room exists; resolve it before adding VEC 501';
  end if;

  select string_agg(d.import_key, ', ') into problem
  from vec_floor45_doors v
  join public.campus_destinations d
    on d.import_key = 'source:navipet_vec_rooms:vec-' || v.room
  where (d.type, d.name, d.code, d.building_code, d.room_number, d.floor_number,
         d.parent_destination_id, d.source, d.source_id, d.active, d.searchable)
    is distinct from
        ('room', 'VEC ' || v.room, 'VEC-' || v.room, 'VEC', v.room, v.floor,
         vec_building_id, 'navipet_vec_rooms', 'VEC-' || v.room, true, true);
  if problem is not null then
    raise exception 'existing room rows differ from the floor 4-5 export: %', problem;
  end if;

  select string_agg(p.point_key, ', ') into problem
  from vec_floor45_doors v
  join public.vec_destination_points p
    on p.map_code = 'MSET_XTBY7AM7ZK77' and p.map_version = 1
    and p.point_key = v.point_key
  left join public.campus_destinations d
    on d.import_key = 'source:navipet_vec_rooms:vec-' || v.room
  where (p.room_number, p.floor, p.x, p.y, p.z, p.heading_deg,
         p.destination_id, p.exported_at, p.active)
    is distinct from (v.room, v.floor, v.x, v.y, v.z, v.heading,
                      d.id, export_time, true);
  if problem is not null then
    raise exception 'existing door points differ from the floor 4-5 export: %', problem;
  end if;

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
  left join public.campus_destinations d
    on d.import_key = 'source:navipet_vec_rooms:vec-' || m.room
    and (d.type, d.code, d.source, d.building_code, d.room_number, d.floor_number,
         d.parent_destination_id, d.active, d.searchable)
      = ('room', 'VEC-' || m.room, 'navipet_vec_rooms', 'VEC', m.room, '3',
         vec_building_id, true, true)
  left join public.vec_destination_points p
    on p.map_code = 'MSET_XTBY7AM7ZK77' and p.map_version = 1
    and p.point_key = m.point_key and p.destination_id = d.id
    and (p.room_number, p.floor, p.y, p.heading_deg, p.active)
      = (m.room, '3', 6.04, 185.36, true)
    and ((p.x, p.z) = (m.old_x, m.old_z) or (p.x, p.z) = (m.new_x, m.new_z))
  where p.id is null;
  if problem is not null then
    raise exception 'floor 3 doors are missing or differ from the expected links or poses: %', problem;
  end if;

  insert into public.campus_destinations (
    import_key, type, name, code, parent_destination_id, building_code,
    room_number, floor_number, source, source_id, metadata, active, searchable
  )
  select
    'source:navipet_vec_rooms:vec-' || v.room,
    'room', 'VEC ' || v.room, 'VEC-' || v.room, vec_building_id, 'VEC',
    v.room, v.floor, 'navipet_vec_rooms', 'VEC-' || v.room,
    case when vec_footprint is null or vec_footprint = 'null'::jsonb then '{}'::jsonb
         else jsonb_build_object('footprint', vec_footprint) end,
    true, true
  from vec_floor45_doors v
  on conflict (import_key) do nothing;

  insert into public.vec_destination_points (
    point_key, point_type, room_number, floor, x, y, z, heading_deg,
    map_provider, map_code, map_version, frame, destination_id, exported_at, active
  )
  select
    v.point_key, 'door', v.room, v.floor, v.x, v.y, v.z, v.heading,
    'multiset', 'MSET_XTBY7AM7ZK77', 1, 'multiset-mapset', d.id, export_time, true
  from vec_floor45_doors v
  join public.campus_destinations d
    on d.import_key = 'source:navipet_vec_rooms:vec-' || v.room
    and (d.type, d.name, d.code, d.building_code, d.room_number, d.floor_number,
         d.parent_destination_id, d.source, d.source_id, d.active, d.searchable)
      = ('room', 'VEC ' || v.room, 'VEC-' || v.room, 'VEC', v.room, v.floor,
         vec_building_id, 'navipet_vec_rooms', 'VEC-' || v.room, true, true)
  on conflict (map_code, map_version, point_key) do nothing;

  update public.vec_destination_points p
  set x = m.new_x, z = m.new_z
  from vec_floor3_moves m
  join public.campus_destinations d
    on d.import_key = 'source:navipet_vec_rooms:vec-' || m.room
    and (d.type, d.code, d.source, d.building_code, d.room_number, d.floor_number,
         d.parent_destination_id, d.active, d.searchable)
      = ('room', 'VEC-' || m.room, 'navipet_vec_rooms', 'VEC', m.room, '3',
         vec_building_id, true, true)
  where p.map_code = 'MSET_XTBY7AM7ZK77' and p.map_version = 1
    and p.point_key = m.point_key and p.destination_id = d.id
    and (p.room_number, p.floor, p.y, p.heading_deg, p.active, p.x, p.z)
      = (m.room, '3', 6.04, 185.36, true, m.old_x, m.old_z);

  if (select count(*) from vec_floor45_doors v
      join public.campus_destinations d
        on d.import_key = 'source:navipet_vec_rooms:vec-' || v.room
        and (d.type, d.name, d.code, d.building_code, d.room_number, d.floor_number,
             d.parent_destination_id, d.source, d.source_id, d.active, d.searchable)
          = ('room', 'VEC ' || v.room, 'VEC-' || v.room, 'VEC', v.room, v.floor,
             vec_building_id, 'navipet_vec_rooms', 'VEC-' || v.room, true, true)
      join public.vec_destination_points p
        on p.map_code = 'MSET_XTBY7AM7ZK77' and p.map_version = 1
        and p.point_key = v.point_key
        and (p.room_number, p.floor, p.x, p.y, p.z, p.heading_deg,
             p.destination_id, p.exported_at, p.active)
          = (v.room, v.floor, v.x, v.y, v.z, v.heading, d.id, export_time, true)) <> 14 then
    raise exception 'expected 14 active floor 4-5 doors with their export poses and room links';
  end if;

  if (select count(*) from vec_floor3_moves m
      join public.campus_destinations d
        on d.import_key = 'source:navipet_vec_rooms:vec-' || m.room
        and (d.type, d.code, d.source, d.building_code, d.room_number, d.floor_number,
             d.parent_destination_id, d.active, d.searchable)
          = ('room', 'VEC-' || m.room, 'navipet_vec_rooms', 'VEC', m.room, '3',
             vec_building_id, true, true)
      join public.vec_destination_points p
        on p.map_code = 'MSET_XTBY7AM7ZK77' and p.map_version = 1
        and p.point_key = m.point_key and p.destination_id = d.id
        and (p.room_number, p.floor, p.y, p.heading_deg, p.active, p.x, p.z)
          = (m.room, '3', 6.04, 185.36, true, m.new_x, m.new_z)) <> 2 then
    raise exception 'expected VEC330 and VEC331 at their confirmed positions with matching room links';
  end if;
end
$$;

drop table vec_floor45_doors, vec_floor3_moves;
