set lock_timeout = '5s';
set statement_timeout = '60s';

-- Race-proof backstop for the API's schedule-conflict check. Two concurrent
-- adds for one user can both pass the service check; this trigger serializes
-- them with a per-user transaction advisory lock and rejects any class whose
-- time overlaps another class of the same user on a shared weekday. Intervals
-- are half-open, so back-to-back classes (09:00-10:00, 10:00-11:00) are fine.
-- A class with no weekdays is asynchronous and never conflicts.
-- SECURITY INVOKER: the lookup runs under the caller's RLS, which already
-- limits it to the caller's own classes.
create or replace function public.classes_prevent_time_conflict()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if cardinality(new.weekdays) = 0 then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('classes:' || new.user_id::text, 0));

  if exists (
    select 1
    from public.classes existing
    where existing.user_id = new.user_id
      and existing.id <> new.id
      and existing.weekdays && new.weekdays
      and existing.start_time < new.end_time
      and existing.end_time > new.start_time
  ) then
    raise exception 'class time conflict'
      using errcode = 'exclusion_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists classes_prevent_time_conflict on public.classes;
create trigger classes_prevent_time_conflict
before insert or update of user_id, weekdays, start_time, end_time on public.classes
for each row execute procedure public.classes_prevent_time_conflict();

reset lock_timeout;
reset statement_timeout;
