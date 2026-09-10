-- 036_beacon_token_auth.sql
-- Token-authenticated phone beacon: tracking without an in-app account.
--
-- 035 gave the phone a place to write, but every function was gated on
-- auth.uid(). That means a rider has to create a Waypoint account, in the app,
-- at the start line, on a phone, with gloves on. The chosen model is the
-- opposite: install, get a 6-char code, someone claims it on the web once, ride.
--
-- So the device's own token becomes the credential. It is generated on the
-- phone, stored in the keychain (expo-secure-store), and never leaves it except
-- over TLS to these functions. Only its SHA-256 is stored here. The functions
-- are SECURITY DEFINER and executable by anon, which is safe precisely because
-- knowing a 32-byte random token is the authorisation.
--
-- Nothing here can read or write anything the token's beacon does not own.

create extension if not exists pgcrypto with schema extensions;

alter table public.device_beacons
  add column if not exists active_participant_id uuid
    references public.event_participants(id) on delete set null;

-- ─── Helpers ─────────────────────────────────────────────────────────────────

create or replace function public.gen_beacon_code()
returns text language plpgsql
set search_path = public
as $$
declare
  -- Same alphabet as gen_waypoint_id: no 0/O/1/I/L, readable off a screen
  -- and typeable onto a roster with cold hands.
  alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    perform 1 from public.device_beacons where upper(claim_code) = code;
    if not found then return code; end if;
  end loop;
end; $$;

create or replace function public.beacon_by_token(p_token text)
returns public.device_beacons
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v public.device_beacons;
begin
  if p_token is null or length(p_token) < 20 then
    return v;
  end if;
  select * into v
    from public.device_beacons
   where device_token_hash = encode(digest(p_token, 'sha256'), 'hex')
     and revoked_at is null
   limit 1;
  return v;
end; $$;

revoke all on function public.beacon_by_token(text) from public, anon, authenticated;

-- ─── Register (first launch) ─────────────────────────────────────────────────
-- Idempotent: re-registering the same token returns the same code, so a
-- reinstall-restore or a retried request never orphans a beacon.

create or replace function public.register_device_beacon(
  p_token       text,
  p_platform    text default null,
  p_app_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v public.device_beacons;
  v_code text;
begin
  if p_token is null or length(p_token) < 20 then
    raise exception 'invalid_token';
  end if;

  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  select * into v from public.device_beacons where device_token_hash = v_hash limit 1;

  if v.id is not null then
    update public.device_beacons
       set platform     = coalesce(p_platform, platform),
           app_version  = coalesce(p_app_version, app_version),
           last_seen_at = now()
     where id = v.id;
    return jsonb_build_object('claim_code', v.claim_code, 'claimed', v.user_id is not null);
  end if;

  v_code := public.gen_beacon_code();

  insert into public.device_beacons
    (claim_code, device_token_hash, platform, app_version, last_seen_at)
  values (v_code, v_hash, p_platform, p_app_version, now());

  return jsonb_build_object('claim_code', v_code, 'claimed', false);
end; $$;

revoke all on function public.register_device_beacon(text, text, text) from public;
grant execute on function public.register_device_beacon(text, text, text) to anon, authenticated;

-- ─── State (what the Setup screen shows) ─────────────────────────────────────

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
begin
  v := public.beacon_by_token(p_token);
  if v.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_device');
  end if;

  update public.device_beacons set last_seen_at = now() where id = v.id;

  if v.user_id is not null then
    -- profiles stores first_name / last_name, not a single display field.
    select btrim(concat_ws(' ', first_name, last_name)) into v_owner
      from public.profiles where id = v.user_id;
  end if;

  if v.active_event_id is not null then
    select name into v_event from public.events where id = v.active_event_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'claim_code', v.claim_code,
    'claimed', v.user_id is not null,
    'owner_name', v_owner,
    'active_event_id', v.active_event_id,
    'active_event_name', v_event,
    'participant_linked', v.active_participant_id is not null
  );
end; $$;

revoke all on function public.beacon_state(text) from public;
grant execute on function public.beacon_state(text) to anon, authenticated;

-- ─── Events this beacon's owner is entered in ────────────────────────────────

create or replace function public.beacon_events(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v public.device_beacons;
  v_rows jsonb;
begin
  v := public.beacon_by_token(p_token);
  if v.id is null or v.user_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'event_id',       e.id,
           'name',           e.name,
           'status',         e.status,
           'starts_at',      e.starts_at,
           'ends_at',        e.ends_at,
           'participant_id', ep.id,
           'rider_number',   ep.rider_number
         ) order by e.starts_at desc nulls last), '[]'::jsonb)
    into v_rows
    from public.event_participants ep
    join public.events e on e.id = ep.event_id
   where ep.user_id = v.user_id
     and (e.ends_at is null or e.ends_at > now() - interval '2 days');

  return v_rows;
end; $$;

revoke all on function public.beacon_events(text) from public;
grant execute on function public.beacon_events(text) to anon, authenticated;

-- ─── Choose the event this beacon feeds (null = personal trip) ───────────────

create or replace function public.beacon_set_event(p_token text, p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v public.device_beacons;
  v_participant uuid;
begin
  v := public.beacon_by_token(p_token);
  if v.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_device');
  end if;
  if v.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_claimed');
  end if;

  if p_event_id is null then
    update public.device_beacons
       set active_event_id = null, active_participant_id = null, last_seen_at = now()
     where id = v.id;
    return jsonb_build_object('ok', true, 'active_event_id', null);
  end if;

  -- The owner must actually be on this event's roster.
  select ep.id into v_participant
    from public.event_participants ep
   where ep.event_id = p_event_id and ep.user_id = v.user_id
   limit 1;

  if v_participant is null then
    return jsonb_build_object('ok', false, 'error', 'not_an_entrant');
  end if;

  update public.event_participants
     set device_type = 'phone'
   where id = v_participant
     and (device_type is null or device_type in ('manual','phone'));

  update public.device_beacons
     set active_event_id = p_event_id,
         active_participant_id = v_participant,
         last_seen_at = now()
   where id = v.id;

  return jsonb_build_object('ok', true, 'active_event_id', p_event_id,
                            'participant_id', v_participant);
end; $$;

revoke all on function public.beacon_set_event(text, uuid) from public;
grant execute on function public.beacon_set_event(text, uuid) to anon, authenticated;

-- ─── Ingest (the hot path) ───────────────────────────────────────────────────
-- Idempotent on (participant_id, recorded_at): a flush interrupted mid-request
-- is always safe to retry, which is the normal case on a marginal connection.

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
       where (p->>'lat') is not null
         and (p->>'lng') is not null
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
