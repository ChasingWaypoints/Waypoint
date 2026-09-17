-- ============================================================
-- Migration v42 — make "Delete Account" actually delete the account
--
-- /api/account/delete calls auth.admin.deleteUser(), which removes the row in
-- auth.users. Two things stopped that from doing what the button promises:
--
-- 1. sos_incidents.opened_by and sos_incident_log.operator_id reference
--    profiles with ON DELETE NO ACTION. There are live rows (1 incident, 11
--    log entries), so Postgres REFUSES the delete outright: the API returns
--    500 and the rider sees "Could not delete account. Try again later."
--    An App Store reviewer hitting that is a 5.1.1(v) rejection, and the
--    rider is left unable to remove their own data.
--
-- 2. Everything else (trips, track points, devices, privacy zones, trip
--    photos) cascades from public.profiles — NOT from auth.users. Those
--    cascades only fire if the profiles row is deleted, which only happens if
--    profiles.id -> auth.users(id) is itself ON DELETE CASCADE. This migration
--    inspects that constraint and repairs it if it is missing or wrong.
--
-- Incident records are kept and the operator is anonymised instead. An SOS
-- incident is event safety history that can outlive somebody's account; the
-- person's name is not needed for the record to remain useful, and keeping a
-- name is what the deletion request is about.
--
-- Run in the WAYPOINT TRACKER Supabase project, AFTER 041. Safe to re-run.
-- ============================================================

-- ── 1. SOS operator columns: block deletion -> anonymise on deletion ───────
do $$
declare
  r record;
begin
  for r in
    select c.conname, c.conrelid::regclass::text as tbl, a.attname as col
    from pg_constraint c
    join lateral unnest(c.conkey) as k(attnum) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
      and c.conrelid in ('public.sos_incidents'::regclass,
                         'public.sos_incident_log'::regclass)
      and c.confdeltype <> 'n'          -- anything that is not already SET NULL
  loop
    -- SET NULL needs a nullable column.
    execute format('alter table %s alter column %I drop not null', r.tbl, r.col);
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references public.profiles(id) on delete set null',
      r.tbl, r.conname, r.col);
    raise notice 'repaired % . % -> SET NULL', r.tbl, r.col;
  end loop;
end $$;

-- ── 2. profiles must die with the auth user, or nothing cascades ──────────
do $$
declare
  v_name text;
  v_rule "char";
begin
  select c.conname, c.confdeltype into v_name, v_rule
  from pg_constraint c
  where c.contype = 'f'
    and c.conrelid  = 'public.profiles'::regclass
    and c.confrelid = 'auth.users'::regclass
  limit 1;

  if v_name is null then
    -- No foreign key at all: deleting the auth user orphans everything.
    alter table public.profiles
      add constraint profiles_id_fkey
      foreign key (id) references auth.users(id) on delete cascade;
    raise notice 'profiles had NO fk to auth.users — created it with CASCADE';

  elsif v_rule <> 'c' then
    execute format('alter table public.profiles drop constraint %I', v_name);
    execute format(
      'alter table public.profiles add constraint %I foreign key (id) references auth.users(id) on delete cascade',
      v_name);
    raise notice 'profiles fk was not CASCADE — replaced it';

  else
    raise notice 'profiles already cascades from auth.users — nothing to do';
  end if;
end $$;

notify pgrst, 'reload schema';

-- ── 3. Report: what still survives an account deletion ────────────────────
-- Read this. Anything pointing at auth.users or profiles that is not CASCADE
-- or SET NULL is data that outlives the person who asked to be forgotten.
select
  c.confrelid::regclass::text as points_at,
  c.conrelid::regclass::text  as child_table,
  a.attname                   as child_column,
  case c.confdeltype
    when 'c' then 'CASCADE — deleted with the user'
    when 'n' then 'SET NULL — row kept, person unlinked'
    when 'a' then 'NO ACTION — BLOCKS the delete'
    when 'r' then 'RESTRICT — BLOCKS the delete'
    when 'd' then 'SET DEFAULT — row kept'
  end                         as on_account_delete
from pg_constraint c
join lateral unnest(c.conkey) as k(attnum) on true
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
where c.contype = 'f'
  and c.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
order by
  case c.confdeltype when 'a' then 1 when 'r' then 1 when 'd' then 2 else 3 end,
  child_table;
