-- Run this once in Supabase Dashboard > SQL Editor.
-- Auth credentials remain in Supabase Auth; this table contains app profile data.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'NaviPet Explorer'
    check (char_length(display_name) between 1 and 80),
  avatar_color bigint not null default 4294946816,
  gems integer not null default 0 check (gems >= 0),
  level integer not null default 1 check (level >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are readable by their owner" on public.profiles;
create policy "Profiles are readable by their owner"
on public.profiles for select
using ((select auth.uid()) = id);

drop policy if exists "Profiles are editable by their owner" on public.profiles;
create policy "Profiles are editable by their owner"
on public.profiles for update
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      case
        when new.is_anonymous then 'Guest Explorer'
        else split_part(coalesce(new.email, 'NaviPet Explorer'), '@', 1)
      end
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- A user's schedule powers class-aware destinations, daily tasks, and
-- achievement progress in the app.
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_code text not null check (char_length(course_code) between 1 and 30),
  course_name text not null check (char_length(course_name) between 1 and 100),
  building text not null check (char_length(building) between 1 and 100),
  room text not null default '',
  weekdays smallint[] not null default '{}' check (weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  start_time time not null default '09:00',
  latitude double precision not null,
  longitude double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists classes_user_id_idx on public.classes(user_id);
alter table public.classes enable row level security;

drop policy if exists "Classes are readable by their owner" on public.classes;
create policy "Classes are readable by their owner" on public.classes
for select using ((select auth.uid()) = user_id);

drop policy if exists "Classes are insertable by their owner" on public.classes;
create policy "Classes are insertable by their owner" on public.classes
for insert with check ((select auth.uid()) = user_id);

drop policy if exists "Classes are editable by their owner" on public.classes;
create policy "Classes are editable by their owner" on public.classes
for update using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Classes are deletable by their owner" on public.classes;
create policy "Classes are deletable by their owner" on public.classes
for delete using ((select auth.uid()) = user_id);

drop trigger if exists classes_set_updated_at on public.classes;
create trigger classes_set_updated_at before update on public.classes
for each row execute procedure public.set_updated_at();

-- Recovery sessions must remain distinguishable from ordinary sessions after a
-- refresh. Supabase keeps one session_id across the token pair's lifetime, so
-- this is the durable, minimal record of that session's purpose.
create table if not exists public.auth_session_purposes (
  session_id uuid primary key,
  purpose text not null check (purpose in ('standard', 'recovery')),
  created_at timestamptz not null default now()
);

alter table public.auth_session_purposes enable row level security;

-- The Custom Access Token Hook receives a generic `otp` method for both
-- recovery and signup verification. The backend records this short-lived
-- marker after it sends a recovery email; the hook consumes it when it mints
-- the corresponding OTP session.
create table if not exists public.auth_recovery_intents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.auth_recovery_intents enable row level security;

-- Configure this function as the project's Custom Access Token Hook in
-- Authentication > Hooks after applying this schema. It runs for every access
-- token issuance and adds a signed session_purpose claim.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claims jsonb := event->'claims';
  session_purpose text := 'standard';
  session_uuid uuid;
  recovery_user_id uuid;
begin
  if claims ? 'session_id' then
    session_uuid := (claims->>'session_id')::uuid;
  end if;

  if event->>'authentication_method' = 'otp' then
    delete from public.auth_recovery_intents
      where user_id = (event->>'user_id')::uuid
        and expires_at > now()
      returning user_id into recovery_user_id;

    session_purpose := case
      when recovery_user_id is null then 'standard'
      else 'recovery'
    end;
    insert into public.auth_session_purposes (session_id, purpose)
    values (session_uuid, session_purpose)
    on conflict (session_id) do update set purpose = excluded.purpose;
  elsif event->>'authentication_method' = 'token_refresh' then
    select purpose into session_purpose
      from public.auth_session_purposes
      where session_id = session_uuid;

    -- OTP sessions minted before this hook started persisting purposes cannot
    -- be safely classified. Do not upgrade them to ordinary sessions.
    if session_purpose is null and claims @> '{"amr":[{"method":"otp"}]}' then
      session_purpose := 'unclassified_otp';
    end if;
  end if;

  claims := jsonb_set(
    claims,
    '{session_purpose}',
    to_jsonb(coalesce(session_purpose, 'standard'))
  );
  return jsonb_build_object('claims', claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb)
  to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb)
  from anon, authenticated, public;

create table if not exists public.task_completions (
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  task_date date not null,
  task_kind text not null check (task_kind in ('attend', 'prepare')),
  completed_at timestamptz not null default now(),
  primary key (user_id, class_id, task_date, task_kind)
);

alter table public.task_completions enable row level security;

drop policy if exists "Task completions are readable by their owner" on public.task_completions;
create policy "Task completions are readable by their owner" on public.task_completions
for select using ((select auth.uid()) = user_id);

drop policy if exists "Task completions are insertable by their owner" on public.task_completions;
create policy "Task completions are insertable by their owner" on public.task_completions
for insert with check ((select auth.uid()) = user_id);

drop policy if exists "Task completions are deletable by their owner" on public.task_completions;
create policy "Task completions are deletable by their owner" on public.task_completions
for delete using ((select auth.uid()) = user_id);
