set lock_timeout = '5s';
set statement_timeout = '60s';

create table public.recent_searches (
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  place_id uuid not null
    references public.campus_destinations(id) on delete cascade,
  type text not null,
  title text not null,
  subtitle text not null,
  source text not null,
  searched_at timestamptz not null default now(),

  primary key (user_id, place_id),
  constraint recent_searches_type_check check (char_length(btrim(type)) between 1 and 40),
  constraint recent_searches_title_check check (char_length(btrim(title)) between 1 and 200),
  constraint recent_searches_subtitle_check check (char_length(btrim(subtitle)) between 1 and 200),
  constraint recent_searches_source_check check (char_length(btrim(source)) between 1 and 120)
);

create index recent_searches_user_searched_at_idx
on public.recent_searches (user_id, searched_at desc);

alter table public.recent_searches enable row level security;

revoke all on table public.recent_searches from anon;
grant select, insert, update, delete on table public.recent_searches to authenticated;
grant select, insert, update, delete on table public.recent_searches to service_role;

create policy "Users manage only their recent searches"
on public.recent_searches
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

comment on table public.recent_searches is
  'User-scoped snapshots of selected canonical campus destinations.';

reset lock_timeout;
reset statement_timeout;
