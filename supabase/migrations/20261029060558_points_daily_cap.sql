-- Cap daily_task points at 50 per user per Los Angeles day (5 in-person classes x 10).
-- Same body as 20261029054241_points_store.sql plus the cap check. The wallet row lock
-- taken before the ledger insert serializes concurrent claims per user, so the sum is race-free.
-- The check runs after the idempotent ledger insert, so replaying an already-paid claim
-- still returns the balance; a cap breach raises and rolls the insert back.

set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function public.claim_daily_task(
  p_class_id uuid,
  p_kind text,
  p_latitude double precision default null,
  p_longitude double precision default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_class public.classes%rowtype;
  v_now timestamp := now() at time zone 'America/Los_Angeles';
  v_today date := v_now::date;
  v_weekday integer := extract(isodow from v_now);
  -- Seconds since midnight; plain time arithmetic would wrap at 00:00.
  v_secs integer := extract(epoch from v_now::time);
  v_reward integer;
  v_balance integer;
  v_inserted integer;
  v_earned_today integer;
begin
  if v_user is null then raise exception 'Sign in to claim points'; end if;
  select * into v_class from public.classes where id = p_class_id and user_id = v_user;
  if not found then raise exception 'Class not found'; end if;

  if p_kind = 'attend' and not v_class.is_online and v_weekday = any(v_class.weekdays) then
    if v_secs < extract(epoch from v_class.start_time) - 900 or
       v_secs > extract(epoch from v_class.end_time) + 900 then
      raise exception 'Class check-in is outside the scheduled time';
    end if;
    if p_latitude is null or p_longitude is null or
       p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180 or
       6371000 * 2 * asin(least(1, sqrt(
         power(sin(radians((v_class.latitude - p_latitude) / 2)), 2) +
         cos(radians(p_latitude)) * cos(radians(v_class.latitude)) *
         power(sin(radians((v_class.longitude - p_longitude) / 2)), 2)
       ))) > 150 then
      raise exception 'Outside the class check-in area';
    end if;
    v_reward := 10;
  elsif p_kind = 'attend_online' and v_class.is_online and v_weekday = any(v_class.weekdays) then
    v_reward := 5;
  elsif p_kind = 'prepare' and not exists (
    select 1 from public.classes c where c.user_id = v_user and v_weekday = any(c.weekdays)
  ) and p_class_id in (
    select c.id from public.classes c where c.user_id = v_user order by c.start_time, c.id limit 3
  ) then
    v_reward := 5;
  else
    raise exception 'Task is not scheduled today';
  end if;

  insert into public.point_wallets (user_id) values (v_user) on conflict do nothing;
  select balance into v_balance from public.point_wallets where user_id = v_user for update;

  -- The ledger is the idempotency key: task_completions is client-deletable, so it
  -- must not be what decides whether a claim already paid out.
  insert into public.point_transactions (user_id, amount, reason, reference_id)
  values (v_user, v_reward, 'daily_task', p_class_id::text || '|' || v_today || '|' || p_kind)
  on conflict (user_id, reason, reference_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return v_balance; end if;

  -- Includes the row just inserted, so this is (earned before + v_reward) > 50.
  select coalesce(sum(amount), 0) into v_earned_today
  from public.point_transactions
  where user_id = v_user and reason = 'daily_task'
    and (created_at at time zone 'America/Los_Angeles')::date = v_today;
  if v_earned_today > 50 then raise exception 'Daily points limit reached'; end if;

  insert into public.task_completions (user_id, class_id, task_date, task_kind)
  values (v_user, p_class_id, v_today, p_kind)
  on conflict do nothing;
  update public.point_wallets set balance = balance + v_reward
  where user_id = v_user returning balance into v_balance;
  return v_balance;
end;
$$;

revoke all on function public.claim_daily_task(uuid, text, double precision, double precision)
  from public, anon;
grant execute on function public.claim_daily_task(uuid, text, double precision, double precision)
  to authenticated;
