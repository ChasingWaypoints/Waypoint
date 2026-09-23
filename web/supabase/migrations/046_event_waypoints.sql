-- ============================================================
-- Migration v46 — operational waypoints for the organizer and sweep team
--
-- Distinct from stage waypoints, which come from the route GPX and describe
-- where the course goes. These are dropped DURING a ride to say what is
-- happening on it: a hazard, a rider down, fuel, a closed gate, where a
-- recovery truck should meet someone.
--
-- Deliberately never on the public page or the embed. build_command_payload
-- carries them; get_event_live_positions does not, and must not.
--
-- Two kinds of author, because sweep runs on a link rather than an account:
--   * a signed-in organizer
--   * a holder of an event_gep_credentials command link
--
-- A rider's own gep_token can READ the command payload today, and that stays
-- true — but it cannot WRITE a waypoint. A per-rider KML token letting an
-- entrant drop hazards on the organizer's map is not a thing anyone asked for.
--
-- created_by / resolved_by are ON DELETE SET NULL, and the author's name is
-- snapshotted into created_by_label, so a waypoint survives its author
-- deleting their account with the record intact and the person unlinked —
-- same treatment as the SOS operator columns in 042.
--
-- Run in the WAYPOINT TRACKER Supabase project, AFTER 045. Safe to re-run.
-- ============================================================

create table if not exists public.event_waypoints (
  id                     uuid primary key default gen_random_uuid(),
  event_id               uuid not null references public.events(id) on delete cascade,
  kind                   text not null,
  note                   text,
  lat                    double precision not null,
  lng                    double precision not null,
  created_at             timestamptz not null default now(),
  created_by             uuid references auth.users(id) on delete set null,
  created_by_credential  uuid references public.event_gep_credentials(id) on delete set null,
  created_by_label       text,
  resolved_at            timestamptz,
  resolved_by            uuid references auth.users(id) on delete set null,
  resolved_by_credential uuid references public.event_gep_credentials(id) on delete set null,
  resolved_note          text
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_waypoints_kind_chk') then
    alter table public.event_waypoints add constraint event_waypoints_kind_chk
      check (kind in ('hazard','rider_down','fuel','water','closure','extraction','other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_waypoints_latlng_chk') then
    alter table public.event_waypoints add constraint event_waypoints_latlng_chk
      check (lat between -90 and 90 and lng between -180 and 180);
  end if;
end $$;

create index if not exists event_waypoints_event_idx
  on public.event_waypoints (event_id, resolved_at nulls first, created_at desc);

alter table public.event_waypoints enable row level security;

-- Organizers (and super admins) work with their own event's waypoints
-- directly. Everyone else goes through the SECURITY DEFINER functions below;
-- anon gets no table access at all.
drop policy if exists "Organizer reads own event waypoints"   on public.event_waypoints;
drop policy if exists "Organizer writes own event waypoints"  on public.event_waypoints;
drop policy if exists "Organizer updates own event waypoints" on public.event_waypoints;

create policy "Organizer reads own event waypoints"
  on public.event_waypoints for select to authenticated
  using (
    exists (select 1 from public.events e
             where e.id = event_id and e.organizer_id = auth.uid())
    or coalesce((select is_super_admin from public.profiles where id = auth.uid()), false)
  );

create policy "Organizer writes own event waypoints"
  on public.event_waypoints for insert to authenticated
  with check (
    exists (select 1 from public.events e
             where e.id = event_id and e.organizer_id = auth.uid())
  );

create policy "Organizer updates own event waypoints"
  on public.event_waypoints for update to authenticated
  using (
    exists (select 1 from public.events e
             where e.id = event_id and e.organizer_id = auth.uid())
  );

-- ── Which event does a COMMAND CREDENTIAL unlock, and is it still live? ────
-- Write access only: credential tokens, not per-rider KML tokens.
create or replace function public.command_credential_event(p_token text)
returns table (event_id uuid, credential_id uuid, credential_label text)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_event uuid; v_cred uuid; v_label text; v_status text; v_ends timestamptz;
begin
  if p_token is null or length(btrim(p_token)) < 8 then return; end if;

  select c.event_id, c.id, c.display_name
    into v_event, v_cred, v_label
    from public.event_gep_credentials c
   where c.gep_token = btrim(p_token)
   limit 1;

  if v_event is null then return; end if;

  -- Same expiry rule the command view already enforces.
  select e.status::text, e.ends_at into v_status, v_ends
    from public.events e where e.id = v_event;
  if v_status in ('completed','cancelled') then return; end if;
  if v_ends is not null and now() > v_ends + interval '1 day' then return; end if;

  event_id := v_event; credential_id := v_cred; credential_label := v_label;
  return next;
end; $fn$;
revoke all on function public.command_credential_event(text) from public;
grant execute on function public.command_credential_event(text) to anon, authenticated;

-- ── Sweep drops a waypoint from the command link ──────────────────────────
create or replace function public.command_add_waypoint(
  p_token text,
  p_kind  text,
  p_lat   double precision,
  p_lng   double precision,
  p_note  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare r record; v_id uuid;
begin
  select * into r from public.command_credential_event(p_token);
  if r.event_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired_link');
  end if;
  if p_kind not in ('hazard','rider_down','fuel','water','closure','extraction','other') then
    return jsonb_build_object('ok', false, 'error', 'bad_kind');
  end if;
  if p_lat is null or p_lng is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return jsonb_build_object('ok', false, 'error', 'bad_coordinates');
  end if;

  insert into public.event_waypoints
    (event_id, kind, note, lat, lng, created_by_credential, created_by_label)
  values
    (r.event_id, p_kind, nullif(btrim(coalesce(p_note,'')), ''), p_lat, p_lng,
     r.credential_id, coalesce(r.credential_label, 'Command link'))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end; $fn$;
revoke all on function public.command_add_waypoint(text, text, double precision, double precision, text) from public;
grant execute on function public.command_add_waypoint(text, text, double precision, double precision, text) to anon, authenticated;

-- ── Sweep resolves one ────────────────────────────────────────────────────
create or replace function public.command_resolve_waypoint(
  p_token text,
  p_waypoint_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare r record; v_hit int;
begin
  select * into r from public.command_credential_event(p_token);
  if r.event_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired_link');
  end if;

  update public.event_waypoints
     set resolved_at            = now(),
         resolved_by_credential = r.credential_id,
         resolved_note          = nullif(btrim(coalesce(p_note,'')), '')
   where id = p_waypoint_id
     and event_id = r.event_id
     and resolved_at is null;

  get diagnostics v_hit = row_count;
  if v_hit = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found_or_already_resolved');
  end if;
  return jsonb_build_object('ok', true);
end; $fn$;
revoke all on function public.command_resolve_waypoint(text, uuid, text) from public;
grant execute on function public.command_resolve_waypoint(text, uuid, text) to anon, authenticated;

-- ── Read: any command token (credential OR rider KML token), same as the
--    command payload already allows. Read is not the sensitive half here.
create or replace function public.command_waypoints(p_token text, p_include_resolved boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare v_event uuid;
begin
  if p_token is null or length(btrim(p_token)) < 8 then return null; end if;

  select event_id into v_event from public.event_gep_credentials
   where gep_token = btrim(p_token) limit 1;
  if v_event is null then
    select event_id into v_event from public.event_participants
     where gep_token = btrim(p_token) limit 1;
  end if;
  if v_event is null then return null; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', w.id, 'kind', w.kind, 'note', w.note,
             'lat', w.lat, 'lng', w.lng,
             'created_at', w.created_at, 'by', w.created_by_label,
             'resolved_at', w.resolved_at, 'resolved_note', w.resolved_note)
           order by w.resolved_at nulls first, w.created_at desc)
    from public.event_waypoints w
   where w.event_id = v_event
     and (p_include_resolved or w.resolved_at is null)
  ), '[]'::jsonb);
end; $fn$;
revoke all on function public.command_waypoints(text, boolean) from public;
grant execute on function public.command_waypoints(text, boolean) to anon, authenticated;

notify pgrst, 'reload schema';

-- ── Verify ────────────────────────────────────────────────────────────────
select 'table' as what, count(*)::text as detail from public.event_waypoints
union all
select 'policies', count(*)::text from pg_policies where tablename = 'event_waypoints'
union all
select 'functions', count(*)::text from pg_proc
 where proname in ('command_credential_event','command_add_waypoint',
                   'command_resolve_waypoint','command_waypoints');
