-- Catalogue holds only the legacy outfits; prices are controlled by the database owner.
set lock_timeout = '5s';
set statement_timeout = '60s';

create table public.pet_costumes (
  id text primary key check (length(id) > 0),
  name text not null,
  price integer not null check (price > 0),
  asset_reference text not null
);
alter table public.pet_costumes enable row level security;
revoke all on public.pet_costumes from public, anon, authenticated;
grant select on public.pet_costumes to authenticated;
create policy "Costumes are readable by authenticated users" on public.pet_costumes
  for select to authenticated using (true);

create function public.get_pet_gems() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_wallet public.point_wallets%rowtype;
  v_owned jsonb;
begin
  if v_user is null then raise exception 'Sign in to view gems'; end if;
  select * into v_wallet from public.point_wallets where user_id = v_user;
  select coalesce(jsonb_agg(outfit_id order by outfit_id), '[]'::jsonb) into v_owned
    from public.outfit_purchases where user_id = v_user;
  return jsonb_build_object('balance', coalesce(v_wallet.balance, 0),
    'equippedOutfit', v_wallet.equipped_outfit, 'ownedOutfits', v_owned);
end;
$$;

create function public.get_pet_costumes() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_result jsonb;
begin
  if v_user is null then raise exception 'Sign in to view costumes'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name,
    'price', c.price, 'assetReference', c.asset_reference,
    'owned', p.outfit_id is not null) order by c.id), '[]'::jsonb)
  into v_result from public.pet_costumes c
  left join public.outfit_purchases p on p.outfit_id = c.id and p.user_id = v_user;
  return v_result;
end;
$$;

create function public.purchase_pet_costume(p_outfit_id text, p_equip boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_price integer;
  v_wallet public.point_wallets%rowtype;
begin
  if v_user is null then raise exception 'Sign in to buy costumes'; end if;
  select price into v_price from public.pet_costumes where id = p_outfit_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  insert into public.point_wallets (user_id) values (v_user) on conflict do nothing;
  select * into v_wallet from public.point_wallets where user_id = v_user for update;
  if not exists (select 1 from public.outfit_purchases where user_id = v_user and outfit_id = p_outfit_id) then
    if v_wallet.balance < v_price then
      return jsonb_build_object('status', 'insufficient', 'shortfall', v_price - v_wallet.balance);
    end if;
    insert into public.point_transactions (user_id, amount, reason, reference_id)
      values (v_user, -v_price, 'outfit_purchase', p_outfit_id);
    insert into public.outfit_purchases (user_id, outfit_id) values (v_user, p_outfit_id);
    update public.point_wallets set balance = balance - v_price where user_id = v_user;
  end if;
  if p_equip then
    update public.point_wallets set equipped_outfit = p_outfit_id where user_id = v_user;
  end if;
  select * into v_wallet from public.point_wallets where user_id = v_user;
  return jsonb_build_object('status', 'ok', 'balance', v_wallet.balance, 'equippedOutfit', v_wallet.equipped_outfit);
end;
$$;

create function public.equip_pet_costume(p_outfit_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_wallet public.point_wallets%rowtype;
begin
  if v_user is null then raise exception 'Sign in to equip costumes'; end if;
  select * into v_wallet from public.point_wallets where user_id = v_user for update;
  if not found or not exists (select 1 from public.outfit_purchases where user_id = v_user and outfit_id = p_outfit_id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  update public.point_wallets set equipped_outfit = p_outfit_id where user_id = v_user returning * into v_wallet;
  return jsonb_build_object('status', 'ok', 'balance', v_wallet.balance, 'equippedOutfit', v_wallet.equipped_outfit);
end;
$$;

revoke all on function public.get_pet_gems(), public.get_pet_costumes(), public.purchase_pet_costume(text, boolean), public.equip_pet_costume(text) from public, anon;
grant execute on function public.get_pet_gems(), public.get_pet_costumes(), public.purchase_pet_costume(text, boolean), public.equip_pet_costume(text) to authenticated;

insert into public.pet_costumes (id, name, price, asset_reference) values
  ('csulb_tee', 'CSULB Tee', 20, 'csulb_tee'),
  ('grad_cap', 'Grad Cap', 30, 'grad_cap'),
  ('shades', 'Shades', 15, 'shades'),
  ('beach_hat', 'Beach Hat', 25, 'beach_hat');

-- Existing clients must use the same catalogue prices as the new API.
create or replace function public.buy_outfit(p_outfit_id text) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  v_result := public.purchase_pet_costume(p_outfit_id, false);
  if v_result->>'status' = 'not_found' then raise exception 'Unknown outfit'; end if;
  if v_result->>'status' = 'insufficient' then raise exception 'Not enough points'; end if;
  return (v_result->>'balance')::integer;
end;
$$;
