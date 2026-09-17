-- ============================================================
-- Migration v43 — the last two columns that block an account deletion
--
-- After 042 the report showed exactly two remaining blockers:
--
--   events.comped_by    -> auth.users   NO ACTION
--   events.suspended_by -> auth.users   NO ACTION
--
-- Both are super-admin audit columns (017 and 019). They are null for an
-- ordinary rider, so the common case already works — but any account that has
-- ever comped or suspended an event cannot be deleted, and Postgres refuses
-- with a foreign-key violation rather than anything legible. That is you, and
-- it is also any admin you ever add.
--
-- Same treatment as the SOS operator columns in 042: keep the record, unlink
-- the person. Who comped an event stays worth knowing; the name is the part
-- a deletion request is actually about.
--
-- Run AFTER 042. Safe to re-run.
-- ============================================================

do $$
declare
  r record;
begin
  for r in
    select c.conname, a.attname as col
    from pg_constraint c
    join lateral unnest(c.conkey) as k(attnum) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.contype = 'f'
      and c.conrelid  = 'public.events'::regclass
      and c.confrelid = 'auth.users'::regclass
      and a.attname in ('comped_by', 'suspended_by')
      and c.confdeltype <> 'n'
  loop
    execute format('alter table public.events alter column %I drop not null', r.col);
    execute format('alter table public.events drop constraint %I', r.conname);
    execute format(
      'alter table public.events add constraint %I foreign key (%I) references auth.users(id) on delete set null',
      r.conname, r.col);
    raise notice 'events.% -> SET NULL', r.col;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ── Confirm: nothing should BLOCK any more ────────────────────────────────
select
  c.conrelid::regclass::text  as child_table,
  a.attname                   as child_column,
  case c.confdeltype
    when 'c' then 'CASCADE'    when 'n' then 'SET NULL'
    when 'a' then 'NO ACTION — STILL BLOCKS'
    when 'r' then 'RESTRICT — STILL BLOCKS'
    when 'd' then 'SET DEFAULT'
  end                         as on_account_delete
from pg_constraint c
join lateral unnest(c.conkey) as k(attnum) on true
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
where c.contype = 'f'
  and c.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
  and c.confdeltype in ('a', 'r')
order by child_table;

-- Zero rows is the answer you want.
