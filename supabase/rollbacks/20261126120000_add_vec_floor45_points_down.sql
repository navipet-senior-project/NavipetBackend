-- Reverses 20261126120000_add_vec_floor45_points without deleting rows:
-- deactivates the 14 floor 4-5 doors and rooms it added (only rows still
-- holding its exact values) and moves VEC330 / VEC331 back to their floor-3
-- migration positions. Recent searches that reference the rooms are kept.
-- Not a migration: run by hand as one script. It commits only if its final
-- checks pass; a raised exception aborts the whole transaction.
-- After it, re-applying the migration stops at its guard (inactive rows);
-- reactivate the rows deliberately instead.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create temporary table vec_floor45_doors on commit drop as
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

with doors as (
  update public.vec_destination_points p
  set active = false
  from vec_floor45_doors v
  where p.map_code = 'MSET_XTBY7AM7ZK77' and p.map_version = 1
    and p.point_key = v.point_key and p.room_number = v.room and p.floor = v.floor
    and p.x = v.x and p.y = v.y and p.z = v.z and p.heading_deg = v.heading
    and p.active
  returning p.destination_id
)
update public.campus_destinations d
set active = false
from doors
where d.id = doors.destination_id
  and d.source = 'navipet_vec_rooms' and d.type = 'room'
  and d.floor_number in ('4', '5') and d.active;

update public.vec_destination_points p
set x = m.old_x, z = m.old_z
from (values
  ('VEC330', 10.0452, 21.5464, 19.1224, 20.6953),
  ('VEC331', 19.0855, 20.6988, 22.0127, 20.4243)
) as m(point_key, old_x, old_z, new_x, new_z)
where p.map_code = 'MSET_XTBY7AM7ZK77' and p.map_version = 1
  and p.point_key = m.point_key and p.floor = '3' and p.active
  and p.x = m.new_x and p.z = m.new_z;

do $$
begin
  if (select count(*) from public.vec_destination_points
      where map_code = 'MSET_XTBY7AM7ZK77' and active and floor in ('4', '5')) <> 0 then
    raise exception 'floor 4-5 doors are still active; nothing was committed';
  end if;
  if (select count(*) from public.vec_destination_points
      where map_code = 'MSET_XTBY7AM7ZK77' and active and floor in ('1', '2', '3')) <> 26 then
    raise exception 'expected 26 active floor 1-3 doors; nothing was committed';
  end if;
  if (select count(*) from public.vec_destination_points
      where map_code = 'MSET_XTBY7AM7ZK77' and map_version = 1 and active
        and (point_key, x, z) in (('VEC330', 10.0452, 21.5464), ('VEC331', 19.0855, 20.6988))) <> 2 then
    raise exception 'VEC330 / VEC331 are not at their floor-3 positions; nothing was committed';
  end if;
end
$$;

commit;
