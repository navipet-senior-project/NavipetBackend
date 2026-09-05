-- Supabase supplies authentication_method = 'otp' for both recovery and
-- signup confirmation in this project. A short-lived backend-created intent
-- lets the Custom Access Token Hook classify the first OTP session correctly.

create table if not exists public.auth_recovery_intents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.auth_recovery_intents enable row level security;
drop table if exists public.auth_token_hook_diagnostics;

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

    if recovery_user_id is not null then
      insert into public.auth_session_purposes (session_id, purpose)
      values (session_uuid, 'recovery')
      on conflict (session_id) do update set purpose = excluded.purpose;
      session_purpose := 'recovery';
    end if;
  elsif event->>'authentication_method' = 'token_refresh' then
    select purpose into session_purpose
      from public.auth_session_purposes
      where session_id = session_uuid;

    if session_purpose is null then
      -- A session minted after the hook was enabled already carries its
      -- signed purpose. Only claim-less legacy OTP sessions are ambiguous.
      if claims->>'session_purpose' = 'standard' then
        session_purpose := 'standard';
      elsif claims @> '{"amr":[{"method":"otp"}]}' then
        session_purpose := 'unclassified_otp';
      end if;
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
