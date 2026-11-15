-- Run on a disposable database after applying migrations, using psql -v ON_ERROR_STOP=1.
begin;
insert into auth.users (id) values ('71d892d2-3fb4-44a1-8e00-000000000001'), ('71d892d2-3fb4-44a1-8e00-000000000002'), ('71d892d2-3fb4-44a1-8e00-000000000003');
insert into auth.users (id) values ('71d892d2-3fb4-44a1-8e00-000000000004'), ('71d892d2-3fb4-44a1-8e00-000000000005'), ('71d892d2-3fb4-44a1-8e00-000000000006');
insert into public.profiles (id, gems) values
  ('71d892d2-3fb4-44a1-8e00-000000000004', 300),
  ('71d892d2-3fb4-44a1-8e00-000000000005', 300),
  ('71d892d2-3fb4-44a1-8e00-000000000006', 300)
on conflict (id) do update set gems = excluded.gems;
insert into public.point_wallets (user_id, balance) values ('71d892d2-3fb4-44a1-8e00-000000000005', 5);
update public.profiles set gems = 300 where id = '71d892d2-3fb4-44a1-8e00-000000000005';
-- Reapply to exercise both backfill paths and idempotence.
\ir ../migrations/20261115000001_sync_pet_gems.sql
\ir ../migrations/20261115000001_sync_pet_gems.sql
do $$ begin
  if (select balance from public.point_wallets where user_id = '71d892d2-3fb4-44a1-8e00-000000000004') <> 300 then raise exception 'profile backfill'; end if;
  if (select gems from public.profiles where id = '71d892d2-3fb4-44a1-8e00-000000000005') <> 5 then raise exception 'wallet must win'; end if;
  if exists (select 1 from public.point_transactions) then raise exception 'backfill wrote ledger'; end if;
end $$;
delete from public.point_wallets where user_id = '71d892d2-3fb4-44a1-8e00-000000000006';
insert into public.pet_costumes (id, name, price, asset_reference) values ('test_hat', 'Hat', 20, 'hat.png');
insert into public.point_wallets (user_id, balance) values
  ('71d892d2-3fb4-44a1-8e00-000000000001', 30), ('71d892d2-3fb4-44a1-8e00-000000000002', 13), ('71d892d2-3fb4-44a1-8e00-000000000003', 100);
select set_config('request.jwt.claim.sub', '71d892d2-3fb4-44a1-8e00-000000000006', true);
set local role authenticated;
do $$ begin
  if (public.get_pet_gems()->>'balance')::integer <> 300 then raise exception 'profile-only balance'; end if;
  if (public.purchase_pet_costume('test_hat', false)->>'balance')::integer <> 280 then raise exception 'profile-only purchase'; end if;
  if (select gems from public.profiles where id = '71d892d2-3fb4-44a1-8e00-000000000006') <> 280 then raise exception 'purchase mirror'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '71d892d2-3fb4-44a1-8e00-000000000001', true);
set local role authenticated;
do $$
declare result jsonb;
begin
  result := public.purchase_pet_costume('test_hat', true);
  if result <> '{"status":"ok","balance":10,"equippedOutfit":"test_hat"}'::jsonb then raise exception 'buy/equip: %', result; end if;
  if public.buy_outfit('test_hat') <> 10 then raise exception 'legacy purchase charged twice'; end if;
  result := public.purchase_pet_costume('test_hat', true);
  if result->>'balance' <> '10' then raise exception 'duplicate charge: %', result; end if;
  if (select count(*) from public.point_transactions where reason = 'outfit_purchase') <> 1 then raise exception 'ledger count'; end if;
  if public.get_pet_gems()->'ownedOutfits' <> '["test_hat"]'::jsonb then raise exception 'ownership missing'; end if;
  if not (select (c->>'owned')::boolean from jsonb_array_elements(public.get_pet_costumes()) c where c->>'id' = 'test_hat') then raise exception 'catalogue ownership missing'; end if;
end $$;
select set_config('request.jwt.claim.sub', '71d892d2-3fb4-44a1-8e00-000000000002', true);
do $$
declare result jsonb;
begin
  result := public.purchase_pet_costume('test_hat', true);
  if result <> '{"status":"insufficient","shortfall":7}'::jsonb then raise exception 'shortfall: %', result; end if;
  if (select balance from public.point_wallets) <> 13 or exists (select 1 from public.point_transactions) or exists (select 1 from public.outfit_purchases) then raise exception 'insufficient purchase changed wallet'; end if;
  if public.equip_pet_costume('test_hat')->>'status' <> 'not_found' then raise exception 'unowned equip'; end if;
end $$;
select set_config('request.jwt.claim.sub', '71d892d2-3fb4-44a1-8e00-000000000003', true);
do $$
begin
  if public.buy_outfit('csulb_tee') <> 80 then raise exception 'csulb_tee price'; end if;
  if public.buy_outfit('grad_cap') <> 50 then raise exception 'grad_cap price'; end if;
  if public.buy_outfit('shades') <> 35 then raise exception 'shades price'; end if;
  if public.buy_outfit('beach_hat') <> 10 then raise exception 'beach_hat price'; end if;
end $$;
rollback;
