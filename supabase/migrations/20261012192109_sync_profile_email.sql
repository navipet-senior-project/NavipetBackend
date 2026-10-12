-- Supabase Auth is the authority for a user's email. Mirror every change of
-- auth.users.email into public.profiles so the two cannot drift apart, no
-- matter which path (API, dashboard, admin) made the change.

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute procedure public.handle_user_email_change();

-- PATCH /profiles/me used to accept an arbitrary email, so existing rows may
-- already disagree with Auth. Realign them once.
update public.profiles as profiles
set email = users.email
from auth.users as users
where users.id = profiles.id
  and profiles.email is distinct from users.email;
