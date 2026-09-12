set lock_timeout = '5s';
set statement_timeout = '60s';

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
revoke all on table public.classes from anon;
grant select, insert, update, delete on table public.classes to authenticated;
grant select, insert, update, delete on table public.classes to service_role;

drop policy if exists "Classes are readable by their owner" on public.classes;
create policy "Classes are readable by their owner" on public.classes for select using ((select auth.uid()) = user_id);
drop policy if exists "Classes are insertable by their owner" on public.classes;
create policy "Classes are insertable by their owner" on public.classes for insert with check ((select auth.uid()) = user_id);
drop policy if exists "Classes are editable by their owner" on public.classes;
create policy "Classes are editable by their owner" on public.classes for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Classes are deletable by their owner" on public.classes;
create policy "Classes are deletable by their owner" on public.classes for delete using ((select auth.uid()) = user_id);

drop trigger if exists classes_set_updated_at on public.classes;
create trigger classes_set_updated_at before update on public.classes for each row execute procedure public.set_updated_at();

reset lock_timeout;
reset statement_timeout;
