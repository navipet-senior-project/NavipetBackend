-- Copy the self-declared role from sign-up metadata into profiles.role.
-- raw_user_meta_data is client-controlled (anyone can call
-- supabase.auth.signUp with the anon key), so only whitelisted values are
-- copied. Anything else becomes null: it never trips profiles_role_check and
-- never fails the sign-up. Anonymous users carry no role and stay null.
-- The trigger on_auth_user_created is unchanged and keeps calling this
-- function.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email, role)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      case
        when new.is_anonymous then 'Guest Explorer'
        else split_part(coalesce(new.email, 'NaviPet Explorer'), '@', 1)
      end
    ),
    new.email,
    case
      when new.raw_user_meta_data ->> 'role' in ('student', 'professor')
        then new.raw_user_meta_data ->> 'role'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
