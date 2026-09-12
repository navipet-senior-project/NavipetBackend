set lock_timeout = '5s';
set statement_timeout = '60s';

alter table public.classes add column if not exists end_time time;
update public.classes set end_time = start_time + interval '1 hour' where end_time is null;
alter table public.classes alter column end_time set default '10:00';
alter table public.classes alter column end_time set not null;

alter table public.classes drop constraint if exists classes_end_time_after_start_time;
alter table public.classes add constraint classes_end_time_after_start_time check (end_time > start_time) not valid;
alter table public.classes validate constraint classes_end_time_after_start_time;

reset lock_timeout;
reset statement_timeout;
