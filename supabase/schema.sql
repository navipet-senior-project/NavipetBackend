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
