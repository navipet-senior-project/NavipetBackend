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
  assert (select count(*) from public.vec_destination_points
          where map_code = 'MSET_XTBY7AM7ZK77' and floor in ('1', '2') and active) = 17,
    'floors 1-2 must still have 17 active points';
  assert (select count(*) from public.campus_destinations
          where building_code = 'VEC' and type = 'room' and floor_number in ('1', '2')) = 17,
    'floors 1-2 must still have 17 rooms';
  assert (select count(*) from public.vec_destination_points p
          join public.campus_destinations d on d.id = p.destination_id
          where p.floor = '3' and d.room_number = p.room_number and d.floor_number = '3') = 9,
    'every floor 3 point must link to its floor 3 room';
  assert (select min(y) = max(y) and min(y) = 6.04 from public.vec_destination_points where floor = '3'),
    'floor 3 y must be 6.04';
  raise notice 'vec floor 3 checks passed';
end $$;
