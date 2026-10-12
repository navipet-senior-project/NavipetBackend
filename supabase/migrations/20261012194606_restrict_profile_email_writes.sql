-- profiles.email mirrors auth.users.email and is written only by the
-- on_auth_user_email_changed trigger. Replace the table-wide update grant with
-- a column list that leaves email out, so a signed-in user cannot change it
-- through the REST API. id and created_at are left out as well: no client has
-- a reason to rewrite them.
revoke update on table public.profiles from anon, authenticated;

grant update (
  display_name,
  role,
  avatar_path,
  avatar_color,
  gems,
  level,
  updated_at
) on table public.profiles to authenticated;
