-- Run in Supabase Dashboard > SQL Editor AFTER 20261126120000_add_vec_floor45_points is applied.
-- Read-only. Success: NOTICE "vec floor 4-5 checks passed" and no error.

do $$
begin
  assert (
    select count(*) filter (where floor_number in ('1', '2')) = 17
       and count(*) filter (where floor_number = '3') = 9
       and count(*) filter (where floor_number = '4') = 7
       and count(*) filter (where floor_number = '5') = 7
       and count(*) = 40
    from public.campus_destinations
    where building_code = 'VEC' and type = 'room' and active
  ), 'expected 17 + 9 + 7 + 7 = 40 active VEC rooms';
  assert not exists (
    select 1 from public.campus_destinations
    where building_code = 'VEC' and type = 'room' and room_number = '510' and active
  ), 'room 501 replaces 510; no active VEC 510 room may exist';
  assert (
    select count(*) = 40 and count(b.id) = 40 and count(p.heading_deg) = 40
    from public.vec_destination_points p
    left join public.campus_destinations d
      on d.id = p.destination_id and d.type = 'room' and d.building_code = 'VEC'
      and d.room_number = p.room_number and d.floor_number = p.floor
      and d.active and d.searchable
    left join public.campus_destinations b
      on b.id = d.parent_destination_id and b.type = 'building' and b.code = 'VEC'
      and b.active and b.searchable
    where p.map_code = 'MSET_XTBY7AM7ZK77' and p.active and p.point_type = 'door'
      and not exists (
        select 1 from public.campus_destinations history
        where history.id = p.destination_id and history.type = 'room'
          and history.building_code = 'VEC' and history.room_number = '510'
          and not history.active
      )
  ), 'expected 40 active VEC doors with headings and matching searchable VEC rooms';
  assert (
    select count(*)
    from (values
      ('VEC301', '301', '3', -23.5303,  6.04,  27.3007,   5.36),
      ('VEC302', '302', '3', -19.7469,  6.04,  26.946,    5.36),
      ('VEC304', '304', '3', -15.848,   6.04,  26.5804,   5.36),
      ('VEC321', '321', '3',   8.8571,  6.04,  24.5574,   5.36),
      ('VEC322', '322', '3',  23.5478,  6.04,  23.2996,   5.36),
      ('VEC325', '325', '3', -15.2283,  6.04,  23.6016, 185.36),
      ('VEC326', '326', '3',  -3.9229,  6.04,  22.5416, 185.36),
      ('VEC330', '330', '3',  19.1224,  6.04,  20.6953, 185.36),
      ('VEC331', '331', '3',  22.0127,  6.04,  20.4243, 185.36),
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
    ) as expected(point_key, room_number, floor, x, y, z, heading_deg)
    join public.vec_destination_points p
      on p.point_key = expected.point_key and p.room_number = expected.room_number
      and p.floor = expected.floor
      and p.x = expected.x and p.y = expected.y and p.z = expected.z
      and p.heading_deg = expected.heading_deg
    join public.campus_destinations d
      on d.id = p.destination_id
      and d.import_key = 'source:navipet_vec_rooms:vec-' || expected.room_number
      and d.code = 'VEC-' || expected.room_number and d.room_number = expected.room_number
      and d.type = 'room' and d.source = 'navipet_vec_rooms'
      and d.building_code = 'VEC' and d.floor_number = expected.floor
      and d.active and d.searchable
    join public.campus_destinations b
      on b.id = d.parent_destination_id and b.type = 'building' and b.code = 'VEC'
      and b.active and b.searchable
    where p.map_code = 'MSET_XTBY7AM7ZK77' and p.map_version = 1
      and p.active and p.point_type = 'door'
      and (expected.floor = '3' or (
        d.name = 'VEC ' || expected.room_number
        and d.source_id = 'VEC-' || expected.room_number
        and p.exported_at = '2026-11-26T10:19:42Z'::timestamptz
      ))
  ) = 23, 'active floor 3-5 doors and their room links must match the export';
  raise notice 'vec floor 4-5 checks passed';
end $$;
