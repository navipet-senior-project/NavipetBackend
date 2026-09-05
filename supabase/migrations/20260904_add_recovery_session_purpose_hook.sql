-- Durable recovery-session classification for the Custom Access Token Hook.
-- Run once in Supabase Dashboard > SQL Editor, then configure
-- public.custom_access_token_hook as Authentication > Hooks > Custom Access
-- Token Hook.

create table if not exists public.auth_session_purposes (
  session_id uuid primary key,
  purpose text not null check (purpose = 'recovery'),
  created_at timestamptz not null default now()
);

alter table public.auth_session_purposes enable row level security;

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
begin
  if claims ? 'session_id' then
    session_uuid := (claims->>'session_id')::uuid;
  end if;

  if event->>'authentication_method' = 'recovery' then
    insert into public.auth_session_purposes (session_id, purpose)
    values (session_uuid, 'recovery')
    on conflict (session_id) do update set purpose = excluded.purpose;
    session_purpose := 'recovery';
  elsif event->>'authentication_method' = 'token_refresh' then
    select purpose into session_purpose
      from public.auth_session_purposes
      where session_id = session_uuid;

    -- OTP sessions minted before the hook was enabled cannot be safely
    -- classified. Do not upgrade them to ordinary sessions on refresh.
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
