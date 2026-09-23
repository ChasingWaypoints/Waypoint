-- ============================================================
-- Migration v45 — one active source per rider, per event
--
-- A rider gets ONE row per event (unique on event_id + user_id) holding one
-- device_type and one feed. The phone beacon was added on top of that without
-- deciding who wins, so a rider with an inReach on the roster AND the app
-- pointed at the same event had both writing to the same slot:
--
--   * get_entrant_feeds kept polling the inReach (device_type still 'garmin')
--   * ingest_phone_points never checked device_type, so the app wrote anyway
--   * both updated last_lat/last_lng, so the marker jumped between a fix from
--     10 minutes ago and one from 30 seconds ago, tens of metres apart
--
-- Nobody chose that. This makes the choice explicit.
--
-- active_source is the single switch every path reads. The roster keeps its
-- feed_url either way, so switching back is instant and an organizer never
-- loses what they typed.
--
-- require_satellite_beacon is the organizer's veto: on a ride through a known
-- dead zone, a rider who HAS a beacon cannot hand their slot to a phone by
-- accident. It only bites when they have a satellite feed to fall back on —
-- refusing a rider with no beacon would leave them invisible, which is worse
-- than tracking them imperfectly.
--
-- Run in the WAYPOINT TRACKER Supabase project, AFTER 044. Safe to re-run.
-- ============================================================

-- ── Columns ────────────────────────────────────────────────────────────────
alter table public.event_participants
  add column if not exists active_source text;

alter table public.events
  add column if not exists require_satellite_beacon boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ep_active_source_chk') then
    alter table public.event_participants
      add constraint ep_active_source_chk
      check (active_source is null or active_source in ('phone','satellite'));
  end if;
end $$;

-- Backfill from what each row already is, so behaviour does not change on
-- deploy: a Garmin/SPOT roster row keeps reporting by satellite, a phone row
-- keeps reporting by phone.
update public.event_participants
   set active_source = case
         when device_type = 'phone'            then 'phone'
         when device_type in ('garmin','spot') then 'satellite'
         else active_source
       end
 where active_source is null;

comment on column public.event_participants.active_source is
  'Which source may report for this rider in this event: phone | satellite. '
  'Null is treated as satellite when a feed exists, phone otherwise.';

-- ── The effective source, in one place ─────────────────────────────────────
create or replace function public.participant_source(p_participant_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    ep.active_source,
    case when ep.feed_url is not null or ep.feed_id is not null
         then 'satellite' else 'phone' end)
  from public.event_participants ep
  where ep.id = p_participant_id;
$fn$;
grant execute on function public.participant_source(uuid) to anon, authenticated;

-- ── Poller: skip riders who are reporting by phone ────────────────────────
create or replace function public.get_entrant_feeds()
returns table (
  id            uuid,
  event_id      uuid,
  display_name  text,
  device_type   text,
  feed_url      text,
  feed_id       text,
  feed_password text,
  last_seen_at  timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select ep.id, ep.event_id, ep.display_name::text, ep.device_type::text,
         ep.feed_url::text, ep.feed_id::text, ep.feed_password::text,
         ep.last_seen_at
  from event_participants ep
  join events e on e.id = ep.event_id
  where e.status = 'active'
    and ep.device_type in ('garmin','spot')
    and (ep.feed_url is not null or ep.feed_id is not null)
    -- Added in 045. A rider who switched to the phone stops being polled;
    -- their feed stays on the roster so switching back costs nothing.
    and coalesce(ep.active_source, 'satellite') <> 'phone';
end;
$$;
grant execute on function public.get_entrant_feeds() to anon, authenticated;

-- ── Phone ingest: refuse unless the phone is the active source ────────────
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

  if not exists (
    select 1 from public.event_participants
     where id = p_participant_id
       and event_id = p_event_id
       and user_id = auth.uid()
  ) then
    raise exception 'not_your_participant';
  end if;

  -- Added in 045. Without this the app wrote alongside a polled inReach and
  -- the marker jumped between them.
  if public.participant_source(p_participant_id) <> 'phone' then
    raise exception 'phone_not_active_source';
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

-- ── Token-auth ingest: same guard ─────────────────────────────────────────
create or replace function public.beacon_ingest(p_token text, p_points jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v public.device_beacons;
  v_inserted integer := 0;
begin
  v := public.beacon_by_token(p_token);
  if v.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_device');
  end if;
  if v.active_event_id is null or v.active_participant_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_active_event');
  end if;

  if public.participant_source(v.active_participant_id) <> 'phone' then
    return jsonb_build_object('ok', false, 'error', 'phone_not_active_source');
  end if;

  with incoming as (
    select
      (p->>'recorded_at')::timestamptz       as recorded_at,
      (p->>'lat')::double precision           as lat,
      (p->>'lng')::double precision           as lng,
      (p->>'altitude_m')::double precision    as altitude_m,
      (p->>'speed_kmh')::double precision     as speed_kmh,
      (p->>'accuracy_m')::double precision    as accuracy_m,
      (p->>'heading_deg')::double precision   as heading_deg,
      (p->>'battery_pct')::smallint           as battery_pct
    from jsonb_array_elements(p_points) as p
  ),
  ins as (
    insert into public.event_track_points
      (participant_id, event_id, lat, lng, altitude_m, speed_kmh,
       accuracy_m, heading_deg, battery_pct, source, recorded_at)
    select v.active_participant_id, v.active_event_id, lat, lng, altitude_m,
           speed_kmh, accuracy_m, heading_deg, battery_pct, 'phone', recorded_at
      from incoming
     where lat is not null and lng is not null and recorded_at is not null
    on conflict (participant_id, recorded_at) do nothing
    returning 1
  )
  select count(*)::integer into v_inserted from ins;

  update public.event_participants ep
     set last_lat     = latest.lat,
         last_lng     = latest.lng,
         last_seen_at = latest.recorded_at
    from (
      select (p->>'lat')::double precision    as lat,
             (p->>'lng')::double precision    as lng,
             (p->>'recorded_at')::timestamptz as recorded_at
      from jsonb_array_elements(p_points) as p
      where (p->>'lat') is not null and (p->>'lng') is not null
        and (p->>'recorded_at') is not null
      order by (p->>'recorded_at')::timestamptz desc
      limit 1
    ) latest
   where ep.id = v.active_participant_id
     and (ep.last_seen_at is null or latest.recorded_at > ep.last_seen_at);

  update public.device_beacons set last_seen_at = now() where id = v.id;

  return jsonb_build_object('ok', true, 'inserted', v_inserted);
end; $$;
revoke all on function public.beacon_ingest(text, jsonb) from public;
grant execute on function public.beacon_ingest(text, jsonb) to anon, authenticated;

-- ── Selecting an event now also claims the source ─────────────────────────
create or replace function public.beacon_set_event(p_token text, p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v public.device_beacons;
  v_participant uuid;
  v_has_sat boolean;
  v_require boolean;
begin
  v := public.beacon_by_token(p_token);
  if v.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_device');
  end if;
  if v.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_claimed');
  end if;

  if p_event_id is null then
    -- Leaving an event hands the slot back to the beacon if there is one.
    if v.active_participant_id is not null then
      update public.event_participants
         set active_source = case
               when feed_url is not null or feed_id is not null
               then 'satellite' else active_source end
       where id = v.active_participant_id;
    end if;
    update public.device_beacons
       set active_event_id = null, active_participant_id = null, last_seen_at = now()
     where id = v.id;
    return jsonb_build_object('ok', true, 'active_event_id', null);
  end if;

  select ep.id,
         (ep.feed_url is not null or ep.feed_id is not null),
         coalesce(e.require_satellite_beacon, false)
    into v_participant, v_has_sat, v_require
    from public.event_participants ep
    join public.events e on e.id = ep.event_id
   where ep.event_id = p_event_id and ep.user_id = v.user_id
   limit 1;

  if v_participant is null then
    return jsonb_build_object('ok', false, 'error', 'not_an_entrant');
  end if;

  -- The organizer's veto. Only bites when the rider actually has a beacon to
  -- fall back on — refusing someone with no beacon would leave them invisible.
  if v_require and v_has_sat then
    return jsonb_build_object('ok', false, 'error', 'satellite_required',
      'participant_id', v_participant);
  end if;

  update public.event_participants
     set active_source = 'phone',
         device_type   = case when v_has_sat then device_type else 'phone' end
   where id = v_participant;

  update public.device_beacons
     set active_event_id = p_event_id,
         active_participant_id = v_participant,
         last_seen_at = now()
   where id = v.id;

  return jsonb_build_object('ok', true, 'active_event_id', p_event_id,
                            'participant_id', v_participant,
                            'switched_from_satellite', v_has_sat);
end; $$;
revoke all on function public.beacon_set_event(text, uuid) from public;
grant execute on function public.beacon_set_event(text, uuid) to anon, authenticated;

-- ── Switch source without leaving the event ───────────────────────────────
create or replace function public.beacon_set_source(p_token text, p_source text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v public.device_beacons;
  v_has_sat boolean;
  v_require boolean;
begin
  if p_source not in ('phone','satellite') then
    return jsonb_build_object('ok', false, 'error', 'bad_source');
  end if;

  v := public.beacon_by_token(p_token);
  if v.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_device');
  end if;
  if v.active_participant_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_active_event');
  end if;

  select (ep.feed_url is not null or ep.feed_id is not null),
         coalesce(e.require_satellite_beacon, false)
    into v_has_sat, v_require
    from public.event_participants ep
    join public.events e on e.id = ep.event_id
   where ep.id = v.active_participant_id;

  if p_source = 'satellite' and not v_has_sat then
    return jsonb_build_object('ok', false, 'error', 'no_satellite_feed');
  end if;
  if p_source = 'phone' and v_require and v_has_sat then
    return jsonb_build_object('ok', false, 'error', 'satellite_required');
  end if;

  update public.event_participants
     set active_source = p_source
   where id = v.active_participant_id;

  return jsonb_build_object('ok', true, 'active_source', p_source);
end; $$;
revoke all on function public.beacon_set_source(text, text) from public;
grant execute on function public.beacon_set_source(text, text) to anon, authenticated;

-- ── State: tell the app which sources exist and which is live ─────────────
create or replace function public.beacon_state(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v public.device_beacons;
  v_owner text;
  v_event text;
  v_source text;
  v_has_sat boolean := false;
  v_sat_kind text;
  v_require boolean := false;
begin
  v := public.beacon_by_token(p_token);
  if v.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_device');
  end if;

  update public.device_beacons set last_seen_at = now() where id = v.id;

  if v.user_id is not null then
    select btrim(concat_ws(' ', first_name, last_name)) into v_owner
      from public.profiles where id = v.user_id;
  end if;

  if v.active_event_id is not null then
    select name into v_event from public.events where id = v.active_event_id;
  end if;

  if v.active_participant_id is not null then
    v_source := public.participant_source(v.active_participant_id);
    select (ep.feed_url is not null or ep.feed_id is not null),
           ep.device_type::text,
           coalesce(e.require_satellite_beacon, false)
      into v_has_sat, v_sat_kind, v_require
      from public.event_participants ep
      join public.events e on e.id = ep.event_id
     where ep.id = v.active_participant_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'claim_code', v.claim_code,
    'claimed', v.user_id is not null,
    'owner_name', v_owner,
    'active_event_id', v.active_event_id,
    'active_event_name', v_event,
    'participant_linked', v.active_participant_id is not null,
    -- Added in 045 so the app can show a source selector rather than failing
    -- silently when the organizer's roster says satellite.
    'active_source', v_source,
    'has_satellite_feed', v_has_sat,
    'satellite_kind', case when v_has_sat then v_sat_kind else null end,
    'satellite_required', v_require
  );
end; $$;
revoke all on function public.beacon_state(text) from public;
grant execute on function public.beacon_state(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- ── Verify ────────────────────────────────────────────────────────────────
select active_source, count(*)
from public.event_participants
group by active_source order by 1;
