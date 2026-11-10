-- Durable Elbee spend reservations. Service role only: the model and the
-- client never call these functions, and the user id is the verified token
-- subject passed by the API. A day-row lock makes parallel reserves see one
-- running total.

set lock_timeout = '5s';
set statement_timeout = '60s';

create table if not exists public.elbee_budget_days (
  day date primary key
);

create table if not exists public.elbee_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_request_id text,
  day date not null,
  micros bigint not null check (micros > 0),
  status text not null check (status in ('reserved', 'released', 'settled')),
  response jsonb,
  created_at timestamptz not null default now(),
  constraint elbee_budget_request_id_check
    check (client_request_id is null or char_length(client_request_id) between 8 and 80)
);

create unique index if not exists elbee_budget_user_request_day
  on public.elbee_budget_reservations (user_id, client_request_id, day)
  where client_request_id is not null and status <> 'released';

alter table public.elbee_budget_days enable row level security;
alter table public.elbee_budget_reservations enable row level security;
revoke all on table public.elbee_budget_days from public, anon, authenticated;
revoke all on table public.elbee_budget_reservations from public, anon, authenticated;
grant select, insert, update, delete on table public.elbee_budget_days to service_role;
grant select, insert, update, delete on table public.elbee_budget_reservations to service_role;

create or replace function public.elbee_reserve_budget(
  p_user_id uuid,
  p_client_request_id text,
  p_micros bigint,
  p_global_cap bigint,
  p_user_cap bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'America/Los_Angeles')::date;
  v_existing public.elbee_budget_reservations%rowtype;
  v_global bigint;
  v_user bigint;
  v_id uuid;
begin
  if p_user_id is null or p_micros is null or p_micros <= 0
     or p_global_cap is null or p_user_cap is null
     or p_global_cap <= 0 or p_user_cap <= 0 or p_user_cap > p_global_cap then
    raise exception 'invalid elbee budget request';
  end if;
  if p_client_request_id is not null and (
    char_length(p_client_request_id) < 8
    or char_length(p_client_request_id) > 80
    or p_client_request_id !~ '^[A-Za-z0-9_-]+$'
  ) then
    raise exception 'invalid elbee request id';
  end if;

  insert into public.elbee_budget_days (day) values (v_day) on conflict do nothing;
  perform 1 from public.elbee_budget_days where day = v_day for update;

  if p_client_request_id is not null then
    select * into v_existing
    from public.elbee_budget_reservations
    where user_id = p_user_id
      and client_request_id = p_client_request_id
      and day = v_day
      and status <> 'released'
    limit 1;
    if found then
      return jsonb_build_object(
        'ok', true,
        'id', v_existing.id,
        'duplicate', true,
        'pending', v_existing.status = 'reserved',
        'response', v_existing.response
      );
    end if;
  end if;

  select coalesce(sum(micros), 0) into v_global
  from public.elbee_budget_reservations
  where day = v_day and status <> 'released';
  select coalesce(sum(micros), 0) into v_user
  from public.elbee_budget_reservations
  where day = v_day and user_id = p_user_id and status <> 'released';

  if v_global + p_micros > p_global_cap or v_user + p_micros > p_user_cap then
    return jsonb_build_object('ok', false, 'reason', 'exhausted');
  end if;

  insert into public.elbee_budget_reservations (user_id, client_request_id, day, micros, status)
  values (p_user_id, p_client_request_id, v_day, p_micros, 'reserved')
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'duplicate', false,
    'pending', false,
    'response', null
  );
end;
$$;

create or replace function public.elbee_finish_budget(
  p_reservation_id uuid,
  p_user_id uuid,
  p_status text,
  p_response jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_status not in ('settled', 'released') then
    raise exception 'invalid elbee budget status';
  end if;
  update public.elbee_budget_reservations
  set status = p_status,
      response = case when p_status = 'settled' then p_response else null end
  where id = p_reservation_id
    and user_id = p_user_id
    and status = 'reserved';
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'elbee reservation not open';
  end if;
end;
$$;

revoke all on function public.elbee_reserve_budget(uuid, text, bigint, bigint, bigint)
  from public, anon, authenticated;
revoke all on function public.elbee_finish_budget(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.elbee_reserve_budget(uuid, text, bigint, bigint, bigint) to service_role;
grant execute on function public.elbee_finish_budget(uuid, uuid, text, jsonb) to service_role;
