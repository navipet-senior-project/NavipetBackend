-- Add the profile fields required by the authenticated profile screen.
alter table public.profiles
  add column if not exists email text,
  add column if not exists role text;

update public.profiles as profiles
set email = users.email
from auth.users as users
where users.id = profiles.id
  and profiles.email is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('student', 'professor'));
  end if;
end
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      case
        when new.is_anonymous then 'Guest Explorer'
        else split_part(coalesce(new.email, 'NaviPet Explorer'), '@', 1)
      end
    ),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
