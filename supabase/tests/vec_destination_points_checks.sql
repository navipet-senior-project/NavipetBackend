-- Run in Supabase Dashboard > SQL Editor AFTER the migration is applied.
-- Everything runs inside one transaction that is rolled back; nothing persists.
-- Success: two NOTICE lines ("constraint checks passed", "RLS checks passed")
-- and no error.

begin;

create temporary table check_ids (room_id uuid) on commit drop;
grant select on check_ids to authenticated;

do $$
declare
  vec_id uuid;
  room_id uuid;
begin
  select id into strict vec_id
  from public.campus_destinations
  where code = 'VEC' and type = 'building';

  insert into public.campus_destinations (
    import_key, type, name, parent_destination_id, building_code,
    room_number, floor_number, source
  )
  values (
    'check:vec-room-999', 'room', 'VEC CHECK 999', vec_id, 'VEC',
    '999', '9', 'check'
  )
  returning id into room_id;
  insert into check_ids values (room_id);

  insert into public.vec_destination_points (
    point_key, point_type, room_number, floor, x, y, z, heading_deg,
    map_provider, map_code, map_version, frame, destination_id, exported_at
  )
  values (
    'VECCHECK', 'door', '999', '9', 1, 2, 3, 90,
    'multiset', 'MSET_CHECK', 1, 'multiset-mapset', room_id, now()
  );

  insert into public.vec_destination_points (
    point_key, point_type, room_number, floor, x, y, z, heading_deg,
    map_provider, map_code, map_version, frame, destination_id, exported_at,
    active
  )
  values (
    'VECCHECKOLD', 'door', '999', '9', 1, 2, 3, 90,
    'multiset', 'MSET_CHECK', 1, 'multiset-mapset', room_id, now(), false
  );

  begin
    insert into public.vec_destination_points (
      point_key, point_type, room_number, floor, x, y, z,
      map_provider, map_code, map_version, frame, destination_id, exported_at,
      active
    )
    values (
      'VECCHECKSTAIRS', 'stairs', '999', '9', 1, 2, 3,
      'multiset', 'MSET_CHECK', 1, 'multiset-mapset', room_id, now(), false
    );
    raise exception 'non-door point_type was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.vec_destination_points (
      point_key, point_type, room_number, floor, x, y, z,
      map_provider, map_code, map_version, frame, destination_id, exported_at,
      active
    )
    values (
      'VECCHECK', 'door', '999', '9', 1, 2, 3,
      'multiset', 'MSET_CHECK', 1, 'multiset-mapset', room_id, now(), false
    );
    raise exception 'duplicate (map_code, map_version, point_key) was accepted';
  exception when unique_violation then null;
  end;

  begin
    insert into public.vec_destination_points (
      point_key, point_type, room_number, floor, x, y, z,
      map_provider, map_code, map_version, frame, destination_id, exported_at
    )
    values (
      'VECCHECK2', 'door', '999', '9', 1, 2, 3,
      'multiset', 'MSET_CHECK', 1, 'multiset-mapset', room_id, now()
    );
    raise exception 'second active door for one room was accepted';
  exception when unique_violation then null;
  end;

  begin
    insert into public.vec_destination_points (
      point_key, point_type, room_number, floor, x, y, z,
      map_provider, map_code, map_version, frame, destination_id, exported_at,
      active
    )
    values (
      'VECCHECKNAN', 'door', '999', '9', 'NaN', 2, 3,
      'multiset', 'MSET_CHECK', 1, 'multiset-mapset', room_id, now(), false
    );
    raise exception 'NaN coordinate was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.vec_destination_points (
      point_key, point_type, room_number, floor, x, y, z, heading_deg,
      map_provider, map_code, map_version, frame, destination_id, exported_at,
      active
    )
    values (
      'VECCHECKHEAD', 'door', '999', '9', 1, 2, 3, 360,
      'multiset', 'MSET_CHECK', 1, 'multiset-mapset', room_id, now(), false
    );
    raise exception 'heading 360 was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.vec_destination_points (
      point_key, point_type, room_number, floor, x, y, z,
      map_provider, map_code, map_version, frame, destination_id, exported_at,
      active
    )
    values (
      'VEC 119', 'door', '999', '9', 1, 2, 3,
      'multiset', 'MSET_CHECK', 1, 'multiset-mapset', room_id, now(), false
    );
    raise exception 'malformed point_key was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.vec_destination_points (
      point_key, point_type, room_number, floor, x, y, z,
      map_provider, map_code, map_version, frame, destination_id, exported_at,
      active
    )
    values (
      'VECCHECKNULL', 'door', '999', '9', 1, 2, 3,
      'multiset', 'MSET_CHECK', 1, 'multiset-mapset', null, now(), false
    );
    raise exception 'door without destination_id was accepted';
  exception when not_null_violation then null;
  end;

  raise notice 'constraint checks passed';
end
$$;

set local role authenticated;

do $$
declare
  room_id uuid;
begin
  select check_ids.room_id into strict room_id from check_ids;

  if not exists (
    select 1 from public.vec_destination_points where point_key = 'VECCHECK'
  ) then
    raise exception 'active row is not readable by authenticated';
  end if;

  if exists (
    select 1 from public.vec_destination_points where point_key = 'VECCHECKOLD'
  ) then
    raise exception 'inactive row is readable by authenticated';
  end if;

  begin
    insert into public.vec_destination_points (
      point_key, point_type, room_number, floor, x, y, z,
      map_provider, map_code, map_version, frame, destination_id, exported_at,
      active
    )
    values (
      'VECCHECKAUTH', 'door', '999', '9', 1, 2, 3,
      'multiset', 'MSET_CHECK', 1, 'multiset-mapset', room_id, now(), false
    );
    raise exception 'authenticated insert was accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.vec_destination_points set x = 0 where point_key = 'VECCHECK';
    raise exception 'authenticated update was accepted';
  exception when insufficient_privilege then null;
  end;

  raise notice 'RLS checks passed';
end
$$;

reset role;
rollback;
