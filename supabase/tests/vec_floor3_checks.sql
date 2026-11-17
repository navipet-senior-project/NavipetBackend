-- Run in Supabase Dashboard > SQL Editor AFTER 20261117205322_add_vec_floor3_points is applied.
-- Read-only. Success: NOTICE "vec floor 3 checks passed" and no error.

do $$
begin
  assert (select count(*) from public.campus_destinations
          where source = 'navipet_vec_rooms' and building_code = 'VEC' and floor_number = '3') = 9,
    'expected 9 floor 3 rooms';
  assert (select count(*) from public.vec_destination_points
          where map_code = 'MSET_XTBY7AM7ZK77' and floor = '3' and active and point_type = 'door') = 9,
    'expected 9 active floor 3 door points';
  assert (
    select count(*) = 17 and count(b.id) = 17
    from public.vec_destination_points p
    left join public.campus_destinations d
      on d.id = p.destination_id and d.type = 'room' and d.building_code = 'VEC'
      and d.room_number = p.room_number and d.floor_number = p.floor
      and d.active and d.searchable
    left join public.campus_destinations b
      on b.id = d.parent_destination_id and b.type = 'building' and b.code = 'VEC'
      and b.active and b.searchable
    where p.map_code = 'MSET_XTBY7AM7ZK77' and p.floor in ('1', '2')
      and p.active and p.point_type = 'door'
  ), 'floors 1-2 must still have 17 active doors linked to matching searchable VEC rooms';
  assert (select count(*) from public.campus_destinations
          where building_code = 'VEC' and type = 'room' and floor_number in ('1', '2')) = 17,
    'floors 1-2 must still have 17 rooms';
  assert (
    select count(*)
    from (values
      ('VEC301', '301', -23.5303, 27.3007,   5.36),
      ('VEC302', '302', -19.7469, 26.946,    5.36),
      ('VEC304', '304', -15.848,  26.5804,   5.36),
      ('VEC321', '321',   8.8571, 24.5574,   5.36),
      ('VEC322', '322',  23.5478, 23.2996,   5.36),
      ('VEC325', '325', -15.2283, 23.6016, 185.36),
      ('VEC326', '326',  -3.9229, 22.5416, 185.36),
      ('VEC330', '330',  10.0452, 21.5464, 185.36),
      ('VEC331', '331',  19.0855, 20.6988, 185.36)
    ) as expected(point_key, room_number, x, z, heading_deg)
    join public.vec_destination_points p
      on p.point_key = expected.point_key and p.room_number = expected.room_number
      and p.x = expected.x and p.y = 6.04 and p.z = expected.z
      and p.heading_deg = expected.heading_deg
    join public.campus_destinations d
      on d.id = p.destination_id
      and d.import_key = 'source:navipet_vec_rooms:vec-' || expected.room_number
      and d.code = 'VEC-' || expected.room_number and d.room_number = expected.room_number
      and d.type = 'room' and d.source = 'navipet_vec_rooms'
      and d.building_code = 'VEC' and d.floor_number = '3' and d.active and d.searchable
    join public.campus_destinations b
      on b.id = d.parent_destination_id and b.type = 'building' and b.code = 'VEC'
      and b.active and b.searchable
    where p.map_code = 'MSET_XTBY7AM7ZK77' and p.map_version = 1
      and p.floor = '3' and p.active and p.point_type = 'door'
  ) = 9, 'active floor 3 doors and their room links must match the export';
  raise notice 'vec floor 3 checks passed';
end $$;
