-- Points store: wallets, ledger, owned outfits, and the RPCs the Flutter client calls.
-- Ported from NaviPetFlutter PR #46 docs/points_schema.sql. Prices and rewards live here
-- so the client cannot set them. Balances change only through the SECURITY DEFINER
-- functions below; authenticated has SELECT only.

set lock_timeout = '5s';
set statement_timeout = '60s';

do $$
begin
  if to_regclass('public.point_wallets') is not null
     or to_regclass('public.point_transactions') is not null
     or to_regclass('public.outfit_purchases') is not null then
    raise exception
      'points tables already exist; inspect them before applying this migration';
  end if;
  if to_regclass('public.classes') is null
     or to_regclass('public.task_completions') is null then
    raise exception 'classes/task_completions are missing; apply the base schema first';
  end if;
end
$$;

create table public.point_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  equipped_outfit text
);

create table public.point_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount <> 0),
  reason text not null check (reason in ('daily_task', 'outfit_purchase')),
  reference_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, reason, reference_id)
);

create table public.outfit_purchases (
  user_id uuid not null references auth.users(id) on delete cascade,
  outfit_id text not null,
  purchased_at timestamptz not null default now(),
  primary key (user_id, outfit_id)
);

alter table public.point_wallets enable row level security;
alter table public.point_transactions enable row level security;
alter table public.outfit_purchases enable row level security;

create policy "Wallets are readable by their owner" on public.point_wallets
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Transactions are readable by their owner" on public.point_transactions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Outfit purchases are readable by their owner" on public.outfit_purchases
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.point_wallets, public.point_transactions, public.outfit_purchases
  from anon, authenticated;
grant select on public.point_wallets, public.point_transactions, public.outfit_purchases
  to authenticated;

create function public.claim_daily_task(
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

  insert into public.task_completions (user_id, class_id, task_date, task_kind)
  values (v_user, p_class_id, v_today, p_kind)
  on conflict do nothing;
  update public.point_wallets set balance = balance + v_reward
  where user_id = v_user returning balance into v_balance;
  return v_balance;
end;
$$;

create function public.equip_outfit(p_outfit_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Sign in to equip outfits'; end if;
  if not exists (
    select 1 from public.outfit_purchases where user_id = v_user and outfit_id = p_outfit_id
  ) then
    raise exception 'Outfit is not owned';
  end if;
  update public.point_wallets set equipped_outfit = p_outfit_id where user_id = v_user;
end;
$$;

create function public.buy_outfit(p_outfit_id text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_price integer;
  v_balance integer;
begin
  if v_user is null then raise exception 'Sign in to buy outfits'; end if;
  v_price := case p_outfit_id
    when 'csulb_tee' then 20
    when 'grad_cap' then 30
    when 'shades' then 15
    when 'beach_hat' then 25
    else null end;
  if v_price is null then raise exception 'Unknown outfit'; end if;
  insert into public.point_wallets (user_id) values (v_user) on conflict do nothing;
  select balance into v_balance from public.point_wallets where user_id = v_user for update;
  if exists (
    select 1 from public.outfit_purchases where user_id = v_user and outfit_id = p_outfit_id
  ) then
    return v_balance;
  end if;
  if v_balance < v_price then raise exception 'Not enough points'; end if;
  insert into public.outfit_purchases (user_id, outfit_id) values (v_user, p_outfit_id);
  insert into public.point_transactions (user_id, amount, reason, reference_id)
  values (v_user, -v_price, 'outfit_purchase', p_outfit_id);
  update public.point_wallets set balance = balance - v_price
  where user_id = v_user returning balance into v_balance;
  return v_balance;
end;
$$;

-- Supabase default privileges grant EXECUTE to anon directly; revoking from public is not enough.
revoke all on function public.claim_daily_task(uuid, text, double precision, double precision)
  from public, anon;
revoke all on function public.buy_outfit(text) from public, anon;
revoke all on function public.equip_outfit(text) from public, anon;
grant execute on function public.claim_daily_task(uuid, text, double precision, double precision)
  to authenticated;
grant execute on function public.buy_outfit(text) to authenticated;
grant execute on function public.equip_outfit(text) to authenticated;
