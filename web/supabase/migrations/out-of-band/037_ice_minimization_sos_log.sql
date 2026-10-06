-- ============================================================
-- Migration v37 — ICE data minimization + SOS incident log
--
-- Implements the locked 2026-09-10 design:
--   • ICE stays event-scoped (event_participants); add ice_captured_at.
--   • SOS creates a persistent, timestamped incident record + response log
--     that SURVIVES the 7-day ICE purge (its own 1-year retention).
--   • purge_expired_event_ice(): nulls ICE 7 days after an event ends,
--     except participants with an open incident. (Scheduling is a deploy step.)
--
-- Profile-level ICE removal (blood_type/allergies/emergency_contact_*/ice_token
-- + get_ice_card) is a SEPARATE later migration, run only after the app has
-- stopped reading/writing those columns.
--
-- Run in the WAYPOINT TRACKER Supabase project. Safe to re-run.
-- ============================================================

-- ── 1. Freshness marker on the event-scoped ICE ─────────────
alter table public.event_participants
  add column if not exists ice_captured_at timestamptz;

-- ── 2. Incident record (one per SOS) ────────────────────────
create table if not exists public.sos_incidents (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.event_participants(id) on delete cascade,
  opened_at      timestamptz not null default now(),   -- the "critical time"
  trigger_lat    double precision,
  trigger_lng    double precision,
  ice_snapshot   jsonb,                                 -- ICE copied in at trigger time
  status         text not null default 'open',          -- open | resolved
  resolved_at    timestamptz,
  retain_until   date not null default ((now() + interval '1 year')::date),
  created_at     timestamptz not null default now()
);
create index if not exists sos_incidents_event on public.sos_incidents (event_id, opened_at desc);
create index if not exists sos_incidents_open  on public.sos_incidents (status) where status = 'open';

-- ── 3. Response timeline (many per incident) ────────────────
create table if not exists public.sos_incident_log (
  id           bigint generated always as identity primary key,
  incident_id  uuid not null references public.sos_incidents(id) on delete cascade,
  kind         text not null check (kind in
                 ('acknowledge','dispatch','medic_onsite','helo_requested','helo_onsite',
                  'recovery_dispatched','recovery_onsite','resolved','note')),
  at           timestamptz not null default now(),
  operator_id  uuid references public.profiles(id),
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists sos_incident_log_incident on public.sos_incident_log (incident_id, at);

-- ── 4. RLS: organizer of the event (or super admin) only ────
alter table public.sos_incidents   enable row level security;
alter table public.sos_incident_log enable row level security;

create or replace function public.is_event_organizer(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and (e.organizer_id = auth.uid()
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_super_admin = true))
  );
$$;

drop policy if exists "sos_incidents_organizer" on public.sos_incidents;
create policy "sos_incidents_organizer" on public.sos_incidents
  for select using (public.is_event_organizer(event_id));

drop policy if exists "sos_log_organizer" on public.sos_incident_log;
create policy "sos_log_organizer" on public.sos_incident_log
  for select using (
    exists (select 1 from public.sos_incidents i
            where i.id = incident_id and public.is_event_organizer(i.event_id))
  );
-- Writes go only through the SECURITY DEFINER RPCs below (no direct client insert).

-- ── 5. RPCs: open / log / resolve ───────────────────────────

-- Open (or return the already-open) incident for a participant, snapshotting ICE.
create or replace function public.open_sos_incident(p_participant_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_event uuid; v_id uuid; ep record;
begin
  select * into ep from public.event_participants where id = p_participant_id;
  if ep is null then raise exception 'participant not found'; end if;
  v_event := ep.event_id;
  if not public.is_event_organizer(v_event) then raise exception 'not authorized'; end if;

  select id into v_id from public.sos_incidents
    where participant_id = p_participant_id and status = 'open'
    order by opened_at desc limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.sos_incidents (event_id, participant_id, trigger_lat, trigger_lng, ice_snapshot)
  values (v_event, p_participant_id, ep.last_lat, ep.last_lng,
          jsonb_build_object('name', ep.display_name, 'ice_name', ep.ice_name,
            'ice_phone', ep.ice_phone, 'blood_type', ep.blood_type, 'allergies', ep.allergies))
  returning id into v_id;

  insert into public.sos_incident_log (incident_id, kind, operator_id, note)
  values (v_id, 'note', auth.uid(), 'Incident opened');
  return v_id;
end; $$;

-- Log one response milestone (or a free note) onto the timeline.
create or replace function public.log_sos_event(p_incident_id uuid, p_kind text, p_note text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_event uuid; v_log bigint;
begin
  select event_id into v_event from public.sos_incidents where id = p_incident_id;
  if v_event is null then raise exception 'incident not found'; end if;
  if not public.is_event_organizer(v_event) then raise exception 'not authorized'; end if;
  insert into public.sos_incident_log (incident_id, kind, operator_id, note)
  values (p_incident_id, p_kind, auth.uid(), p_note)
  returning id into v_log;
  if p_kind = 'resolved' then
    update public.sos_incidents set status = 'resolved', resolved_at = now() where id = p_incident_id;
  end if;
  return v_log;
end; $$;

revoke all on function public.open_sos_incident(uuid)   from public;
revoke all on function public.log_sos_event(uuid, text, text) from public;
grant execute on function public.open_sos_incident(uuid)   to authenticated;
grant execute on function public.log_sos_event(uuid, text, text) to authenticated;

-- ── 6. Purge function — 7 days after an event ends ──────────
-- Nulls event-scoped ICE except for participants with an OPEN incident.
-- Incident records (and their ice_snapshot) are untouched.
-- Schedule via pg_cron or an edge function (deploy step); safe to run manually.
create or replace function public.purge_expired_event_ice()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  with expired as (
    select e.id from public.events e
    where e.ends_at is not null
      and e.ends_at < now() - interval '7 days'
  ),
  cleared as (
    update public.event_participants ep
       set ice_name = null, ice_phone = null, blood_type = null,
           allergies = null, ice_captured_at = null
     where ep.event_id in (select id from expired)
       and (ep.ice_name is not null or ep.ice_phone is not null
            or ep.blood_type is not null or ep.allergies is not null)
       and not exists (
         select 1 from public.sos_incidents i
         where i.participant_id = ep.id and i.status = 'open')
    returning ep.id)
  select count(*) into v_count from cleared;
  return v_count;
end; $$;
revoke all on function public.purge_expired_event_ice() from public;
-- Grant execute to the service role only (called by the scheduler), not clients.
