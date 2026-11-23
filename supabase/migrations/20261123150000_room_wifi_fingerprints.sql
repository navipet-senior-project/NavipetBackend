alter table public.campus_destinations
  add column if not exists wifi_fingerprints jsonb;

do $$
begin
  alter table public.campus_destinations
    add constraint campus_destinations_wifi_fingerprints_check
    check (wifi_fingerprints is null or (type = 'room' and jsonb_typeof(wifi_fingerprints) = 'array'));
exception when duplicate_object then null;
end $$;
