-- Run on a disposable database after applying migrations, using psql -v ON_ERROR_STOP=1.
begin;
insert into auth.users (id) values
  ('71d892d2-3fb4-44a1-8e01-000000000001'), ('71d892d2-3fb4-44a1-8e01-000000000002'),
  ('71d892d2-3fb4-44a1-8e01-000000000003');
insert into public.point_wallets (user_id, balance) values
  ('71d892d2-3fb4-44a1-8e01-000000000001', 100), ('71d892d2-3fb4-44a1-8e01-000000000003', 100);
-- User 3 already earned 48 today from class tasks: 5 more would pass the shared 50 cap.
insert into public.point_transactions (user_id, amount, reason, reference_id)
values ('71d892d2-3fb4-44a1-8e01-000000000003', 48, 'daily_task', 'seed');

select set_config('request.jwt.claim.sub', '71d892d2-3fb4-44a1-8e01-000000000001', true);
set local role authenticated;
do $$
declare result jsonb;
begin
  result := public.claim_daily_login();
  if result <> '{"status":"ok","balance":105,"earned":5}'::jsonb then raise exception 'first claim: %', result; end if;
  result := public.claim_daily_login();
  if result <> '{"status":"ok","balance":105,"earned":0}'::jsonb then raise exception 'repeat claim: %', result; end if;
  if (select count(*) from public.point_transactions where reason = 'daily_login') <> 1 then raise exception 'ledger count'; end if;
end $$;

select set_config('request.jwt.claim.sub', '71d892d2-3fb4-44a1-8e01-000000000003', true);
do $$
declare result jsonb;
begin
  result := public.claim_daily_login();
  if result <> '{"status":"ok","balance":100,"earned":0}'::jsonb then raise exception 'capped claim: %', result; end if;
  if exists (select 1 from public.point_transactions where reason = 'daily_login' and user_id = '71d892d2-3fb4-44a1-8e01-000000000003') then raise exception 'capped claim wrote ledger'; end if;
end $$;

-- User 2 has no wallet; the claim creates it. Another user's rows stay untouched.
select set_config('request.jwt.claim.sub', '71d892d2-3fb4-44a1-8e01-000000000002', true);
do $$
begin
  if (public.claim_daily_login()->>'earned')::integer <> 5 then raise exception 'new wallet claim'; end if;
  if (select balance from public.point_wallets where user_id = '71d892d2-3fb4-44a1-8e01-000000000001') <> 105 then raise exception 'isolation'; end if;
end $$;
reset role;
do $$ begin
  if has_function_privilege('anon', 'public.claim_daily_login()', 'execute') then raise exception 'anon can execute'; end if;
end $$;
rollback;
