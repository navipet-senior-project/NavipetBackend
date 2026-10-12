set lock_timeout = '5s';
set statement_timeout = '60s';

-- One row per user, created lazily on the first update. A user with no row
-- has every preference at its column default.
create table public.accessibility_preferences (
  user_id uuid primary key default auth.uid()
    references auth.users(id) on delete cascade,

  -- Mobility: independent flags, read by routing.
  accessible_routes boolean not null default false,
  avoid_stairs boolean not null default false,
  prefer_elevators boolean not null default false,
  avoid_steep_slopes boolean not null default false,

  -- Guidance
  voice_guidance boolean not null default true,
  haptic_turn_alerts boolean not null default true,

  -- Visuals
  high_contrast_map boolean not null default false,
  larger_map_labels boolean not null default false,
  reduce_motion boolean not null default false,
  screen_reader_directions boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.accessibility_preferences enable row level security;

revoke all on table public.accessibility_preferences from anon;
grant select, insert, update on table public.accessibility_preferences to authenticated;
grant select, insert, update on table public.accessibility_preferences to service_role;

create policy "Users read only their accessibility preferences"
on public.accessibility_preferences
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users create only their accessibility preferences"
on public.accessibility_preferences
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users update only their accessibility preferences"
on public.accessibility_preferences
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create trigger accessibility_preferences_set_updated_at
  before update on public.accessibility_preferences
  for each row execute procedure public.set_updated_at();

comment on table public.accessibility_preferences is
  'Per-user accessibility settings from the Navigation & Accessibility screen.';

reset lock_timeout;
reset statement_timeout;
