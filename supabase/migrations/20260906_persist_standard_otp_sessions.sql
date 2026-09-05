-- Persist both registration and recovery OTP session purposes. Supabase does
-- not include a previously-added custom claim in the token_refresh hook event,
-- so refresh must recover either purpose by session_id.

alter table public.auth_session_purposes
  drop constraint if exists auth_session_purposes_purpose_check;
alter table public.auth_session_purposes
  add constraint auth_session_purposes_purpose_check
  check (purpose in ('standard', 'recovery'));

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
