-- Add VEC floor 3: 9 room rows in campus_destinations + 9 door points.
-- Insert-only and repeat-safe: existing rows (floors 1-2 included) are never
-- updated, deactivated or deleted.
--
-- Source: Unity catalog vec_floors123.json (floor_3 doors) mapped into the
-- MapSet frame with the rigid transform that reproduces all 17 existing
-- floor 1-2 rows to 4 decimals (rotate -5.3563 deg about Y, translate XZ;
-- heading_deg = rotationY + 5.36). XZ cross-checked against the MultiSet
-- viewer cursor. y = 6.04: floor 3 slab measured at Y 5.990-6.041 in the
-- MapSet viewer (map "3 4", MSET_XTBY7AM7ZK77), plus the ~0.03 m offset
-- floor 2 rows use above their slab.

insert into public.campus_destinations (
  import_key, type, name, code, parent_destination_id, building_code,
  room_number, floor_number, source, source_id, metadata
)
select
  'source:navipet_vec_rooms:vec-' || v.room,
  'room',
  'VEC ' || v.room,
  'VEC-' || v.room,
  (select id from public.campus_destinations where code = 'VEC' and type = 'building'),
  'VEC',
  v.room,
  '3',
  'navipet_vec_rooms',
  'VEC-' || v.room,
  (select metadata from public.campus_destinations where import_key = 'source:navipet_vec_rooms:vec-227')
from (values ('301'), ('302'), ('304'), ('321'), ('322'), ('325'), ('326'), ('330'), ('331')) as v(room)
on conflict (import_key) do nothing;

insert into public.vec_destination_points (
  point_key, point_type, room_number, floor, x, y, z, heading_deg,
  map_provider, map_code, map_version, frame, destination_id, exported_at
)
select
  p.point_key, 'door', p.room, '3', p.x, 6.04, p.z, p.heading,
  'multiset', 'MSET_XTBY7AM7ZK77', 1, 'multiset-mapset', d.id, now()
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
) as p(point_key, room, x, z, heading)
join public.campus_destinations d
  on d.import_key = 'source:navipet_vec_rooms:vec-' || p.room
on conflict do nothing;
