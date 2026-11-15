set lock_timeout = '5s';
set statement_timeout = '60s';

-- A missing balance means the wallet is being created by an existing RPC.
alter table public.point_wallets alter column balance drop default;

create or replace function public.seed_point_wallet_balance() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.balance is null then
    select coalesce((select gems from public.profiles where id = new.user_id), 0) into new.balance;
  end if;
  return new;
end;
$$;
drop trigger if exists seed_point_wallet_balance on public.point_wallets;
create trigger seed_point_wallet_balance before insert on public.point_wallets
for each row execute function public.seed_point_wallet_balance();

create or replace function public.mirror_point_wallet_balance() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set gems = new.balance where id = new.user_id and gems is distinct from new.balance;
  return new;
end;
$$;
drop trigger if exists mirror_point_wallet_balance on public.point_wallets;
create trigger mirror_point_wallet_balance after insert or update of balance on public.point_wallets
for each row execute function public.mirror_point_wallet_balance();

create or replace function public.mirror_profile_gems() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 or new.gems is null then return new; end if;
  if tg_op = 'INSERT' and new.gems = 0 then return new; end if;
  insert into public.point_wallets (user_id, balance) values (new.id, new.gems)
  on conflict (user_id) do update set balance = excluded.balance
  where public.point_wallets.balance is distinct from excluded.balance;
  return new;
end;
$$;
drop trigger if exists mirror_profile_gems on public.profiles;
create trigger mirror_profile_gems after insert or update of gems on public.profiles
for each row execute function public.mirror_profile_gems();

revoke update (gems) on table public.profiles from authenticated;

insert into public.point_wallets (user_id, balance)
select id, gems from public.profiles where gems > 0
on conflict (user_id) do update set balance = excluded.balance
where public.point_wallets.balance < excluded.balance;

update public.profiles p set gems = w.balance
from public.point_wallets w where p.id = w.user_id and p.gems is distinct from w.balance;

create or replace function public.get_pet_gems() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_wallet public.point_wallets%rowtype;
  v_owned jsonb;
  v_balance integer;
begin
  if v_user is null then raise exception 'Sign in to view gems'; end if;
  select * into v_wallet from public.point_wallets where user_id = v_user;
  v_balance := coalesce(v_wallet.balance, 0);
  select coalesce(jsonb_agg(outfit_id order by outfit_id), '[]'::jsonb) into v_owned
    from public.outfit_purchases where user_id = v_user;
  return jsonb_build_object('balance', v_balance,
    'equippedOutfit', v_wallet.equipped_outfit, 'ownedOutfits', v_owned);
end;
$$;
