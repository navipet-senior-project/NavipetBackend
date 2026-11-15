-- Run on a disposable database after applying migrations, using psql -v ON_ERROR_STOP=1.
begin;
insert into auth.users (id) values ('71d892d2-3fb4-44a1-8e00-000000000001'), ('71d892d2-3fb4-44a1-8e00-000000000002');
insert into public.pet_costumes (id, name, price, asset_reference) values ('test_hat', 'Hat', 20, 'hat.png');
insert into public.point_wallets (user_id, balance) values
  ('71d892d2-3fb4-44a1-8e00-000000000001', 30), ('71d892d2-3fb4-44a1-8e00-000000000002', 13);
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
  if not (public.get_pet_costumes()->0->>'owned')::boolean then raise exception 'catalogue ownership missing'; end if;
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
rollback;
