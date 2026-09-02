-- ============================================================
-- Migration v5 — Event entrants as beacon feeds
--
-- Context: until now an event participant HAD to be an app user
-- (event_participants.user_id was NOT NULL -> auth.users) and their
-- positions came from their own trips/track_points.
--
-- The product model is now: an organizer batch-loads a roster of
-- entrants, each identified by name/number/class, and each carrying a
-- PUBLIC beacon share feed (Garmin MapShare URL, SPOT feed id, ZOLEO).
-- Entrants need no account and no app. The server polls those feeds.
--
-- Run in the Supabase SQL editor AFTER events_migration_v4.
-- Safe to re-run: every statement is guarded.
-- ============================================================

-- ── 1. Entrants no longer have to be app users ──────────────
alter table public.event_participants
  alter column user_id drop not null;

-- The old unique(event_id, user_id) blocks more than one
-- account-less entrant per event, since (event_id, null) collides
-- in some configurations and it is meaningless for roster rows.
-- Replace it with a partial unique index that only applies to real users.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'event_participants_event_id_user_id_key'
  ) then
    alter table public.event_participants
      drop constraint event_participants_event_id_user_id_key;
  end if;
end $$;

create unique index if not exists ep_unique_event_user
  on public.event_participants (event_id, user_id)
  where user_id is not null;

-- ── 2. Beacon feed attached directly to the entrant ─────────
alter table public.event_participants
  add column if not exists device_type    text,
  add column if not exists feed_url       text,   -- Garmin MapShare URL
  add column if not exists feed_id        text,   -- SPOT feed id
  add column if not exists feed_password  text,   -- SPOT feed password (optional)
  add column if not exists notes          text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ep_device_type_check'
  ) then
    alter table public.event_participants
      add constraint ep_device_type_check
      check (device_type is null or device_type in ('garmin','spot','zoleo','phone','manual'));
  end if;
end $$;

-- ── 3. Denormalised last-known position (drives the live map) ─
alter table public.event_participants
  add column if not exists last_lat        double precision,
  add column if not exists last_lng        double precision,
  add column if not exists last_seen_at    timestamptz,
  add column if not exists last_polled_at  timestamptz,
  add column if not exists poll_error      text;

-- ── 4. Per-entrant breadcrumb trail ─────────────────────────
-- Separate from track_points, which is keyed to trips/app users.
create table if not exists public.event_track_points (
  id             bigint generated always as identity primary key,
  participant_id uuid        not null references public.event_participants(id) on delete cascade,
  event_id       uuid        not null references public.events(id) on delete cascade,
  lat            double precision not null,
  lng            double precision not null,
  altitude_m     double precision,
  speed_kmh      double precision,
  message        text,
  source         text,
  recorded_at    timestamptz not null,
  created_at     timestamptz not null default now(),
  -- one row per entrant per fix: makes the poller idempotent
  unique (participant_id, recorded_at)
);

create index if not exists etp_event_recorded
  on public.event_track_points (event_id, recorded_at desc);
create index if not exists etp_participant_recorded
  on public.event_track_points (participant_id, recorded_at desc);

alter table public.event_track_points enable row level security;

-- Organizer of the event can read the trail; nobody writes from the client
-- (the cron writes via SECURITY DEFINER below).
drop policy if exists "etp_select_organizer" on public.event_track_points;
create policy "etp_select_organizer" on public.event_track_points
  for select using (
    exists (
      select 1 from public.events e
      where e.id = event_id and e.organizer_id = auth.uid()
    )
  );

-- ── 5. Roster read for organizer ────────────────────────────
-- ep_select from v1 only covers app users; organizers need to see
-- account-less roster rows for their own events.
drop policy if exists "ep_select_organizer" on public.event_participants;
create policy "ep_select_organizer" on public.event_participants
  for select using (
    exists (
      select 1 from public.events e
      where e.id = event_id and e.organizer_id = auth.uid()
    )
  );

drop policy if exists "ep_write_organizer" on public.event_participants;
create policy "ep_write_organizer" on public.event_participants
  for all using (
    exists (
      select 1 from public.events e
      where e.id = event_id and e.organizer_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.events e
      where e.id = event_id and e.organizer_id = auth.uid()
    )
  );

-- ── 6. Writer used by the polling cron ──────────────────────
-- Inserts a fix and rolls the entrant's last-known position forward.
-- SECURITY DEFINER so the cron does not need the service role key,
-- consistent with the v4 approach.
create or replace function public.record_entrant_fix(
  p_participant_id uuid,
  p_lat            double precision,
  p_lng            double precision,
  p_recorded_at    timestamptz,
  p_altitude_m     double precision default null,
  p_speed_kmh      double precision default null,
  p_message        text default null,
  p_source         text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_inserted boolean := false;
begin
  select event_id into v_event_id
  from event_participants where id = p_participant_id;

  if v_event_id is null then
    return false;
  end if;

  insert into event_track_points
    (participant_id, event_id, lat, lng, altitude_m, speed_kmh, message, source, recorded_at)
  values
    (p_participant_id, v_event_id, p_lat, p_lng, p_altitude_m, p_speed_kmh, p_message, p_source, p_recorded_at)
  on conflict (participant_id, recorded_at) do nothing;

  get diagnostics v_inserted = row_count;

  -- Only move the marker forward in time, never backwards
  update event_participants
     set last_lat     = p_lat,
         last_lng     = p_lng,
         last_seen_at = p_recorded_at
   where id = p_participant_id
     and (last_seen_at is null or p_recorded_at > last_seen_at);

  return v_inserted;
end;
$$;

-- Records the outcome of a poll attempt (success clears the error).
create or replace function public.record_entrant_poll(
  p_participant_id uuid,
  p_error          text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update event_participants
     set last_polled_at = now(),
         poll_error     = p_error
   where id = p_participant_id;
end;
$$;

-- ── 7. Feeds the cron needs to poll ─────────────────────────
create or replace function public.get_entrant_feeds()
returns table (
  id            uuid,
  event_id      uuid,
  display_name  text,
  device_type   text,
  feed_url      text,
  feed_id       text,
  feed_password text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select ep.id, ep.event_id, ep.display_name::text, ep.device_type::text,
         ep.feed_url::text, ep.feed_id::text, ep.feed_password::text
  from event_participants ep
  join events e on e.id = ep.event_id
  where e.status = 'active'
    and ep.device_type in ('garmin','spot')
    and (ep.feed_url is not null or ep.feed_id is not null);
end;
$$;

-- ── 8. Live positions for the map / embed / KML ─────────────
-- Public by share_token. Returns only what a spectator may see —
-- no feed URLs, no passwords, no tokens.
create or replace function public.get_event_live_positions(p_share_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event   record;
  v_result  jsonb;
begin
  select id, name, status, route_gpx, route_name, starts_at
    into v_event
  from events
  where share_token = p_share_token
  limit 1;

  if v_event.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'event', jsonb_build_object(
      'name',       v_event.name,
      'status',     v_event.status,
      'route_gpx',  v_event.route_gpx,
      'route_name', v_event.route_name,
      'starts_at',  v_event.starts_at
    ),
    'entrants', coalesce(jsonb_agg(
      jsonb_build_object(
        'id',           ep.id,
        'name',         ep.display_name,
        'number',       ep.rider_number,
        'class',        ep.rider_class,
        'lat',          ep.last_lat,
        'lng',          ep.last_lng,
        'last_seen_at', ep.last_seen_at,
        'device_type',  ep.device_type
      )
      order by ep.rider_number nulls last, ep.display_name
    ) filter (where ep.last_lat is not null), '[]'::jsonb)
  )
  into v_result
  from event_participants ep
  where ep.event_id = v_event.id;

  return v_result;
end;
$$;

-- Breadcrumb trail for one entrant, public by share token.
create or replace function public.get_event_entrant_track(
  p_share_token    text,
  p_participant_id uuid,
  p_max_points     int default 500
)
returns table (
  lat         double precision,
  lng         double precision,
  recorded_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  select id into v_event_id from events where share_token = p_share_token limit 1;
  if v_event_id is null then return; end if;

  return query
  select tp.lat, tp.lng, tp.recorded_at
  from event_track_points tp
  where tp.event_id = v_event_id
    and tp.participant_id = p_participant_id
  order by tp.recorded_at desc
  limit p_max_points;
end;
$$;

-- ── 9. Google Earth Pro feed support ────────────────────────
-- The GEP KML previously iterated app users and read their trips.
-- Entrants have no user_id, so it needs the roster instead.
create or replace function public.get_event_entrants_for_gep(p_event_id uuid)
returns table (
  id           uuid,
  user_id      uuid,
  display_name text,
  rider_number text,
  rider_class  text,
  role         text,
  last_lat     double precision,
  last_lng     double precision,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select ep.id, ep.user_id, ep.display_name::text, ep.rider_number::text,
         ep.rider_class::text, ep.role::text,
         ep.last_lat, ep.last_lng, ep.last_seen_at
  from event_participants ep
  where ep.event_id = p_event_id
  order by ep.role, ep.rider_number nulls last, ep.display_name;
end;
$$;

-- Track for one entrant, by participant id (used after GEP token validation).
create or replace function public.get_entrant_track_by_id(
  p_participant_id uuid,
  p_max_points     int default 500
)
returns table (
  lat         double precision,
  lng         double precision,
  altitude_m  double precision,
  speed_kmh   double precision,
  recorded_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select tp.lat, tp.lng, tp.altitude_m, tp.speed_kmh, tp.recorded_at
  from event_track_points tp
  where tp.participant_id = p_participant_id
  order by tp.recorded_at asc
  limit p_max_points;
end;
$$;

-- ── 10. Grants ──────────────────────────────────────────────
grant execute on function public.record_entrant_fix(uuid, double precision, double precision, timestamptz, double precision, double precision, text, text) to anon, authenticated;
grant execute on function public.record_entrant_poll(uuid, text)                to anon, authenticated;
grant execute on function public.get_entrant_feeds()                            to anon, authenticated;
grant execute on function public.get_event_live_positions(text)                 to anon, authenticated;
grant execute on function public.get_event_entrant_track(text, uuid, int)       to anon, authenticated;
grant execute on function public.get_event_entrants_for_gep(uuid)               to anon, authenticated;
grant execute on function public.get_entrant_track_by_id(uuid, int)             to anon, authenticated;
