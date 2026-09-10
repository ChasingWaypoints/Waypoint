-- 035_phone_beacons.sql
-- Phone-as-beacon support for the Waypoint mobile app.
--
-- Until now the phone client only wrote personal trip points (track_points,
-- keyed by trip_id). It had no way to appear on an event map, which is the
-- whole point of the beacon. This migration adds:
--
--   1. device_beacons  — one row per installed app, claimed once by a Waypoint
--                        account via a 6-char code (same shape as waypoint_id).
--   2. Fidelity columns on event_track_points. A Garmin share page publishes
--      neither accuracy nor heading; a phone has both, and accuracy is what
--      lets the map suppress a garbage 500 m fix instead of drawing a teleport.
--      battery_pct answers the organizer's real question at 2 a.m.: is he
--      stopped, or is his phone dead?
--
-- events.ends_at already exists (023_event_dates). device_type already allows
-- 'phone' (ep_device_type_check). Nothing to do for either.

-- ─── 1. Fidelity columns ─────────────────────────────────────────────────────
alter table public.event_track_points
  add column if not exists accuracy_m  double precision,
  add column if not exists heading_deg double precision,
  add column if not exists battery_pct smallint;

comment on column public.event_track_points.accuracy_m is
  'Horizontal accuracy in metres. Null for share-page devices (Garmin/SPOT/ZOLEO).';
comment on column public.event_track_points.heading_deg is
  'Course over ground, 0-360 true. Null for share-page devices.';
comment on column public.event_track_points.battery_pct is
  'Reporting device battery 0-100. Null for share-page devices.';

-- track_points predates this migration set (legacy schema), so guard it.
do $trkpts$
begin
  if to_regclass('public.track_points') is not null then
    alter table public.track_points
      add column if not exists heading_deg double precision,
      add column if not exists battery_pct smallint;
  end if;
end
$trkpts$;

-- ─── 2. device_beacons ───────────────────────────────────────────────────────
create table if not exists public.device_beacons (
  id                uuid primary key default gen_random_uuid(),
  claim_code        char(6) not null unique,
  device_token_hash text    not null,
  user_id           uuid    references auth.users(id) on delete cascade,
  platform          text    check (platform in ('ios','android')),
  app_version       text,
  active_event_id   uuid    references public.events(id) on delete set null,
  active_trip_id    uuid,
  claimed_at        timestamptz,
  last_seen_at      timestamptz,
  revoked_at        timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists device_beacons_user   on public.device_beacons (user_id);
create index if not exists device_beacons_token  on public.device_beacons (device_token_hash);
create unique index if not exists device_beacons_code_ci
  on public.device_beacons (upper(claim_code));

comment on table public.device_beacons is
  'One row per installed Waypoint mobile app. The claim_code is a human-readable
   handle for linking the device to an account; device_token_hash is the actual
   credential. Never store the raw token.';

alter table public.device_beacons enable row level security;

-- Owners see and manage their own devices. Unclaimed rows are invisible to
-- everyone: claiming happens through a security-definer function, not RLS.
drop policy if exists "beacons_select_own" on public.device_beacons;
create policy "beacons_select_own" on public.device_beacons
  for select using (user_id = auth.uid());

drop policy if exists "beacons_update_own" on public.device_beacons;
create policy "beacons_update_own" on public.device_beacons
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "beacons_delete_own" on public.device_beacons;
create policy "beacons_delete_own" on public.device_beacons
  for delete using (user_id = auth.uid());

-- ─── 3. Claim a device to the calling account ────────────────────────────────
create or replace function public.claim_device_beacon(p_claim_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_beacon public.device_beacons;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_beacon
    from public.device_beacons
   where upper(claim_code) = upper(trim(p_claim_code))
     and revoked_at is null
   limit 1;

  if v_beacon.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_code');
  end if;

  if v_beacon.user_id is not null and v_beacon.user_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;

  update public.device_beacons
     set user_id    = auth.uid(),
         claimed_at = coalesce(claimed_at, now())
   where id = v_beacon.id;

  return jsonb_build_object('ok', true, 'device_id', v_beacon.id);
end;
$$;

revoke all on function public.claim_device_beacon(text) from public;
grant execute on function public.claim_device_beacon(text) to authenticated;

-- ─── 4. Resolve this account's participant row for an event ──────────────────
-- The app knows its user and the event it selected; it does not know the
-- participant_id that event_track_points is keyed by. This hands it back, and
-- flips the entrant to device_type 'phone' so the poller leaves it alone.
create or replace function public.resolve_phone_participant(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  select id into v_participant_id
    from public.event_participants
   where event_id = p_event_id
     and user_id  = auth.uid()
   limit 1;

  if v_participant_id is null then
    return null;
  end if;

  update public.event_participants
     set device_type = 'phone'
   where id = v_participant_id
     and (device_type is null or device_type in ('manual','phone'));

  return v_participant_id;
end;
$$;

revoke all on function public.resolve_phone_participant(uuid) from public;
grant execute on function public.resolve_phone_participant(uuid) to authenticated;

-- ─── 5. Batch ingest of queued phone fixes ───────────────────────────────────
-- The app buffers fixes offline and flushes them in bursts. One round trip per
-- burst, idempotent on (participant_id, recorded_at) so a retried flush after a
-- dropped connection cannot duplicate a track.
create or replace function public.ingest_phone_points(
  p_participant_id uuid,
  p_event_id       uuid,
  p_points         jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  -- The caller must actually own this entrant row.
  if not exists (
    select 1 from public.event_participants
     where id = p_participant_id
       and event_id = p_event_id
       and user_id = auth.uid()
  ) then
    raise exception 'not_your_participant';
  end if;

  with incoming as (
    select
      (p->>'recorded_at')::timestamptz     as recorded_at,
      (p->>'lat')::double precision         as lat,
      (p->>'lng')::double precision         as lng,
      (p->>'altitude_m')::double precision  as altitude_m,
      (p->>'speed_kmh')::double precision   as speed_kmh,
      (p->>'accuracy_m')::double precision  as accuracy_m,
      (p->>'heading_deg')::double precision as heading_deg,
      (p->>'battery_pct')::smallint         as battery_pct
    from jsonb_array_elements(p_points) as p
  ),
  ins as (
    insert into public.event_track_points
      (participant_id, event_id, lat, lng, altitude_m, speed_kmh,
       accuracy_m, heading_deg, battery_pct, source, recorded_at)
    select p_participant_id, p_event_id, lat, lng, altitude_m, speed_kmh,
           accuracy_m, heading_deg, battery_pct, 'phone', recorded_at
      from incoming
     where lat is not null and lng is not null and recorded_at is not null
    on conflict (participant_id, recorded_at) do nothing
    returning 1
  )
  select count(*)::integer into v_inserted from ins;

  -- Keep the roster's last-known position fresh for the live map. Recomputed
  -- from the payload because the CTE above is out of scope once that statement
  -- ends, and because the newest fix in the burst is the one that matters even
  -- if it collided with an existing row.
  update public.event_participants ep
     set last_lat     = latest.lat,
         last_lng     = latest.lng,
         last_seen_at = latest.recorded_at
    from (
      select
        (p->>'lat')::double precision     as lat,
        (p->>'lng')::double precision     as lng,
        (p->>'recorded_at')::timestamptz  as recorded_at
      from jsonb_array_elements(p_points) as p
      where (p->>'lat') is not null
        and (p->>'lng') is not null
        and (p->>'recorded_at') is not null
      order by (p->>'recorded_at')::timestamptz desc
      limit 1
    ) latest
   where ep.id = p_participant_id
     and (ep.last_seen_at is null or latest.recorded_at > ep.last_seen_at);

  return v_inserted;
end;
$$;

revoke all on function public.ingest_phone_points(uuid, uuid, jsonb) from public;
grant execute on function public.ingest_phone_points(uuid, uuid, jsonb) to authenticated;
