#!/usr/bin/env bash
# Run only against a disposable migrated database with psql installed.
set -euo pipefail
: "${PET_GEMS_TEST_DATABASE_URL:?Set PET_GEMS_TEST_DATABASE_URL to a disposable migrated database}"
psql_cmd=(psql "$PET_GEMS_TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1)
user_id=$("${psql_cmd[@]}" -Atc 'select gen_random_uuid()')
costume_id="test_concurrent_$user_id"
scratch_dir=$(mktemp -d)
cleanup() {
  "${psql_cmd[@]}" -c "delete from auth.users where id = '$user_id'; delete from public.pet_costumes where id = '$costume_id';" >/dev/null
  rm -rf "$scratch_dir"
}
trap cleanup EXIT
"${psql_cmd[@]}" -c "insert into auth.users (id) values ('$user_id'); insert into public.pet_costumes values ('$costume_id', 'Hat', 20, 'hat.png'); insert into public.point_wallets (user_id, balance) values ('$user_id', 30);"
# Hold the wallet lock until both independent sessions are waiting on it.
"${psql_cmd[@]}" -c "begin; select 1 from public.point_wallets where user_id = '$user_id' for update; select pg_sleep(3); commit;" > "$scratch_dir/lock" &
lock_pid=$!
sleep 1
for n in 1 2; do
  "${psql_cmd[@]}" -c "begin; set local role authenticated; select set_config('request.jwt.claim.sub', '$user_id', true); select public.purchase_pet_costume('$costume_id', true); commit;" > "$scratch_dir/$n" &
  if [ "$n" = 1 ]; then first_pid=$!; else second_pid=$!; fi
done
wait "$lock_pid"
wait "$first_pid"
wait "$second_pid"
"${psql_cmd[@]}" -c "do \$\$ begin
  if (select balance from public.point_wallets where user_id = '$user_id') <> 10 or
     (select equipped_outfit from public.point_wallets where user_id = '$user_id') <> '$costume_id' or
     (select count(*) from public.point_transactions where user_id = '$user_id' and reason = 'outfit_purchase' and reference_id = '$costume_id') <> 1 or
     (select count(*) from public.outfit_purchases where user_id = '$user_id' and outfit_id = '$costume_id') <> 1
  then raise exception 'Concurrent purchase charged incorrectly'; end if;
end \$\$;"
